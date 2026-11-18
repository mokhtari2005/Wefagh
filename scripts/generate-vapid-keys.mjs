// Run locally once: node scripts/generate-vapid-keys.mjs
// The private key is written only to the ignored local file .vapid-keys.json.
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateJwk = privateKey.export({ format: 'jwk' });
const publicJwk = publicKey.export({ format: 'jwk' });
const rawPublic = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, 'base64url'), Buffer.from(publicJwk.y, 'base64url')]);
const publicKeyBase64Url = rawPublic.toString('base64url');
writeFileSync('.vapid-keys.json', JSON.stringify({ privateJwk, publicKey: publicKeyBase64Url }, null, 2), { mode: 0o600 });
console.log('کلیدها در فایل محلی .vapid-keys.json ساخته شد. این فایل را در GitHub بارگذاری نکنید.');
console.log('VAPID_PUBLIC_KEY:', publicKeyBase64Url);
