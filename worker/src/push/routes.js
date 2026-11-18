import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
export async function handlePush(request, env, path) {
  if (!env.DB) return json({ok:false,error:'DB_NOT_CONFIGURED'},503);
  const user = await currentUser(request,env);
  if (!user) return json({ok:false,error:'UNAUTHENTICATED'},401);
  if (path === '/api/push/public-key') {
    if (request.method !== 'GET') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    if (!env.VAPID_PUBLIC_KEY) return json({ok:false,error:'PUSH_NOT_CONFIGURED'},503);
    return json({ok:true,publicKey:env.VAPID_PUBLIC_KEY});
  }
  if (path !== '/api/push/subscription') return null;
  if (request.method === 'GET') {
    const endpoint = new URL(request.url).searchParams.get('endpoint');
    if (!endpoint) return json({ok:true,active:false});
    const row=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE user_id=?1 AND endpoint=?2 LIMIT 1').bind(user.id,endpoint).first();
    return json({ok:true,active:Boolean(row)});
  }
  const parsed=await readJsonBody(request); if(parsed.error)return parsed.error;
  const body=parsed.body||{};
  if(request.method==='POST'){
    const endpoint=body.endpoint, p256dh=body.keys?.p256dh, auth=body.keys?.auth;
    let host=''; try { const parsedEndpoint=new URL(endpoint); host=parsedEndpoint.hostname; if(parsedEndpoint.protocol!=='https:'||parsedEndpoint.username||parsedEndpoint.password) throw new Error('invalid endpoint'); } catch { return json({ok:false,error:'VALIDATION_FAILED'},422); }
    const allowedHost=host==='fcm.googleapis.com'||host==='web.push.apple.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.notify.windows.com');
    if(!allowedHost||endpoint.length>2048||typeof p256dh!=='string'||p256dh.length>256||typeof auth!=='string'||auth.length>128)return json({ok:false,error:'VALIDATION_FAILED'},422);
    await env.DB.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,updated_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at`).bind(user.id,endpoint,p256dh,auth,new Date().toISOString()).run();
    return json({ok:true});
  }
  if(request.method==='DELETE'){
    if(typeof body.endpoint!=='string'||!body.endpoint.startsWith('https://'))return json({ok:false,error:'VALIDATION_FAILED'},422);
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id=?1 AND endpoint=?2').bind(user.id,body.endpoint).run();
    return json({ok:true});
  }
  return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST, DELETE'});
}