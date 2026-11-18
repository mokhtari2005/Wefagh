import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginMutationAllowed, readJsonBody, MAX_BODY_BYTES } from '../worker/src/http.js';
import worker from '../worker/src/index.js';

const env = { PUBLIC_BASE_URL: 'https://mokhtari.ir' };

function request(method, headers = {}, body) {
  return new Request('https://mokhtari.ir/api/account', {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

test('درخواست تغییردهنده با کوکی نشست فقط از مبدأ اصلی پذیرفته می‌شود', () => {
  const cookie = 'wefagh_session=valid-session';
  assert.equal(isSameOriginMutationAllowed(request('POST', {
    cookie,
    origin: 'https://mokhtari.ir',
    'sec-fetch-site': 'same-origin',
  }), env), true);

  assert.equal(isSameOriginMutationAllowed(request('POST', {
    cookie,
    origin: 'https://attacker.example',
    'sec-fetch-site': 'cross-site',
  }), env), false);
});

test('درخواست تغییردهنده با کوکی و بدون Origin رد می‌شود؛ درخواست خواندنی نیاز به Origin ندارد', () => {
  assert.equal(isSameOriginMutationAllowed(request('POST', {
    cookie: 'wefagh_session=valid-session',
  }), env), false);
  assert.equal(isSameOriginMutationAllowed(request('GET', {
    cookie: 'wefagh_session=valid-session',
  }), env), true);
});

test('درخواست بدون کوکی نشست یا Origin نامعتبر در مسیر عمومی مسدود نمی‌شود', () => {
  assert.equal(isSameOriginMutationAllowed(request('POST', {
    origin: 'https://attacker.example',
  }), env), true);
});

test('بدنه JSON معتبر با محدودیت اندازه خوانده می‌شود', async () => {
  const result = await readJsonBody(request('POST', {
    'content-type': 'application/json; charset=utf-8',
  }, JSON.stringify({ ok: true })));
  assert.deepEqual(result.body, { ok: true });
});

test('بدنه JSON بزرگ حتی بدون اتکا به Content-Length رد می‌شود', async () => {
  const body = JSON.stringify({ payload: 'x'.repeat(MAX_BODY_BYTES) });
  const result = await readJsonBody(request('POST', {
    'content-type': 'application/json',
  }, body));
  assert.equal((await result.error.json()).error, 'PAYLOAD_TOO_LARGE');
});

test('نوع محتوای غیر JSON و JSON خراب رد می‌شوند', async () => {
  const wrongType = await readJsonBody(request('POST', {
    'content-type': 'text/plain',
  }, '{}'));
  assert.equal(wrongType.error.status, 415);

  const malformed = await readJsonBody(request('POST', {
    'content-type': 'application/json',
  }, '{'));
  assert.equal(malformed.error.status, 400);
});

test('دروازهٔ اصلی Worker درخواست جعلی بین‌مبدأ با کوکی نشست را پیش از رسیدن به API رد می‌کند', async () => {
  const res = await worker.fetch(request('POST', {
    cookie: 'wefagh_session=valid-session',
    origin: 'https://attacker.example',
    'sec-fetch-site': 'cross-site',
    'content-type': 'application/json',
  }, '{}'), {});
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'CROSS_ORIGIN_REQUEST_BLOCKED');
});
