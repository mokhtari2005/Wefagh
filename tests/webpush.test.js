import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, webcrypto } from 'node:crypto';
import { sendWebPush } from '../worker/src/push/webpush.js';

const b64url = (value) => Buffer.from(value).toString('base64url');

test('Web Push builds an encrypted aes128gcm request and signs VAPID', async () => {
  globalThis.crypto ||= webcrypto;
  const vapid = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateJwk = vapid.privateKey.export({ format: 'jwk' });
  const publicJwk = vapid.publicKey.export({ format: 'jwk' });
  const publicRaw = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, 'base64url'), Buffer.from(publicJwk.y, 'base64url')]);

  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey));
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    p256dh: b64url(receiverPublic),
    auth: randomBytes(16).toString('base64url'),
  };

  const previousFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(null, { status: 201 });
  };
  try {
    const result = await sendWebPush({
      VAPID_PRIVATE_JWK: JSON.stringify(privateJwk),
      VAPID_PUBLIC_KEY: b64url(publicRaw),
      VAPID_SUBJECT: 'mailto:info@mokhtari.ir',
    }, subscription, { title: 'موعد', body: 'یادآوری آزمایشی' });
    assert.equal(result.ok, true);
    assert.equal(captured.url, subscription.endpoint);
    assert.equal(captured.options.headers['Content-Encoding'], 'aes128gcm');
    assert.match(captured.options.headers.Authorization, /^vapid t=.+, k=/);
    assert.ok(captured.options.body.byteLength > 100);
    assert.equal(new DataView(captured.options.body.buffer).getUint32(16), 4096);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
