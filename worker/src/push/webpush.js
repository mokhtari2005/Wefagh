const enc=new TextEncoder();
const b64u=b=>{let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');};
const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const cat=(...a)=>{const o=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let p=0;for(const x of a){o.set(x,p);p+=x.length;}return o;};
async function mac(k,d){const key=await crypto.subtle.importKey('raw',k,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,d));}
async function expand(prk,info,n){let t=new Uint8Array(0),out=new Uint8Array(0),i=1;while(out.length<n){t=await mac(prk,cat(t,info,new Uint8Array([i++])));out=cat(out,t);}return out.slice(0,n);}
const part=o=>b64u(enc.encode(JSON.stringify(o)));
async function tokenFor(endpoint,env){const j=JSON.parse(env.VAPID_PRIVATE_JWK);const k=await crypto.subtle.importKey('jwk',j,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const s=part({typ:'JWT',alg:'ES256'})+'.'+part({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+43200,sub:env.VAPID_SUBJECT||'mailto:info@mokhtari.ir'});return s+'.'+b64u(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k,enc.encode(s))));}
async function encrypt(sub,payload){
 const ua=unb64u(sub.p256dh),auth=unb64u(sub.auth),receiver=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),as=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiver},pair.privateKey,256));
 const prkAuth=await mac(auth,shared),ikm=await expand(prkAuth,cat(enc.encode('WebPush: info\0'),ua,as),32),salt=crypto.getRandomValues(new Uint8Array(16)),prk=await mac(salt,ikm);
 const cek=await expand(prk,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await expand(prk,enc.encode('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']),plain=cat(enc.encode(JSON.stringify(payload)),new Uint8Array([2]));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,plain)),header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096,false);header[20]=as.length;return cat(header,as,cipher);
}
export async function sendWebPush(env,sub,payload){
 if(!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY)return {ok:false,configured:false};
 const body=await encrypt(sub,payload),jwt=await tokenFor(sub.endpoint,env);
 const r=await fetch(sub.endpoint,{method:'POST',headers:{Authorization:'vapid t='+jwt+', k='+env.VAPID_PUBLIC_KEY,'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:'86400',Urgency:'high'},body});
 return {ok:r.status>=200&&r.status<300,stale:r.status===404||r.status===410,status:r.status};
}