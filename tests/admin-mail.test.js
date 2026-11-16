// تست تشخیص ایمیل مدیر: دسترسی، وضعیت Secretها، بررسی توکن، ایمیل آزمایشی و قالب پیام. بدون شبکه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { buildRawMessage } from '../worker/src/email/gmail.js';

let DatabaseSync;
let sqliteAvailable = true;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  sqliteAvailable = false;
}
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';

const here = dirname(fileURLToPath(import.meta.url));
const migration = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');

function d1Like(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
      return {
        bind(...args) {
          return {
            first: async () => stmt.get(...args) ?? null,
            all: async () => ({ success: true, results: stmt.all(...args) }),
            run: async () => {
              if (/RETURNING/i.test(sql)) return { success: true, results: stmt.all(...args) };
              stmt.run(...args);
              return { success: true, results: [] };
            },
          };
        },
      };
    },
  };
}

function setup(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0008_registration_profile.sql'));
  const sent = [];
  const env = {
    DB: d1Like(db),
    PUBLIC_BASE_URL: 'https://mokhtari.ir',
    ADMIN_EMAIL: 'admin@example.com',
    mailer: async (msg) => { sent.push(msg); },
    ...extra,
  };
  return { db, env, sent };
}

async function call(env, path, { method = 'POST', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(`https://mokhtari.ir${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }), env);
}

async function loginAs(env, sent, email) {
  const user = { email, password: 'رمز-امن-۱۴۰۵', displayName: 'کاربر آزمایشی' };
  await call(env, '/api/auth/register', { body: user });
  const token = sent.at(-1).text.match(/token=([A-Za-z0-9_-]+)/)[1];
  await call(env, '/api/auth/verify-email', { body: { token } });
  const res = await call(env, '/api/auth/login', { body: { email, password: user.password } });
  return `wefagh_session=${/wefagh_session=([^;]+)/.exec(res.headers.get('set-cookie'))[1]}`;
}

test('تشخیص ایمیل: بدون ورود ۴۰۱ و برای کاربر عادی ۴۰۳', { skip }, async () => {
  const { env, sent } = setup();
  assert.equal((await call(env, '/api/admin/mail/status', { method: 'GET' })).status, 401);
  const cookie = await loginAs(env, sent, 'user@example.com');
  assert.equal((await call(env, '/api/admin/mail/status', { method: 'GET', cookie })).status, 403);
  assert.equal((await call(env, '/api/admin/mail/test', { cookie, body: {} })).status, 403);
});

test('تشخیص ایمیل: نام Secretهای تعریف‌نشده گزارش می‌شود و مقدار هیچ Secretی نمی‌آید', { skip }, async () => {
  const { env, sent } = setup({ GMAIL_CLIENT_ID: 'cid-SECRET', GMAIL_FROM: 'from@example.com' });
  const cookie = await loginAs(env, sent, 'admin@example.com');
  const res = await call(env, '/api/admin/mail/status', { method: 'GET', cookie });
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.configured, false);
  assert.deepEqual(body.missing, ['GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']);
  assert.ok(!text.includes('cid-SECRET'));
});

test('بررسی توکن: invalid_grant راهنمای انقضای refresh token می‌دهد', { skip }, async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token expired' }), { status: 400 });
  const { env, sent } = setup({
    GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b', GMAIL_REFRESH_TOKEN: 'c', GMAIL_FROM: 'f@example.com', fetchImpl,
  });
  const cookie = await loginAs(env, sent, 'admin@example.com');
  const body = await (await call(env, '/api/admin/mail/status?probe=1', { method: 'GET', cookie })).json();
  assert.equal(body.configured, true);
  assert.equal(body.probe.ok, false);
  assert.equal(body.probe.reason, 'invalid_grant');
  assert.match(body.probe.hint, /Production/);
  assert.ok(!JSON.stringify(body).includes('Token expired'));
});

test('بررسی توکن: موفق', { skip }, async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ access_token: 'AT' }), { status: 200 });
  const { env, sent } = setup({
    GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b', GMAIL_REFRESH_TOKEN: 'c', GMAIL_FROM: 'f@example.com', fetchImpl,
  });
  const cookie = await loginAs(env, sent, 'admin@example.com');
  const body = await (await call(env, '/api/admin/mail/status?probe=1', { method: 'GET', cookie })).json();
  assert.deepEqual(body.probe, { ok: true });
});

test('ایمیل آزمایشی به نشانی خود مدیر می‌رود و خطا با راهنما برگردانده می‌شود', { skip }, async () => {
  const { env, sent } = setup();
  const cookie = await loginAs(env, sent, 'admin@example.com');
  const before = sent.length;
  const ok = await call(env, '/api/admin/mail/test', { cookie, body: {} });
  assert.equal(ok.status, 200);
  assert.equal(sent.length, before + 1);
  assert.equal(sent.at(-1).to, 'admin@example.com');

  const failing = Object.assign(new Error('GMAIL_SEND_FAILED'), { status: 403 });
  env.mailer = async () => { throw failing; };
  const bad = await call(env, '/api/admin/mail/test', { cookie, body: {} });
  assert.equal(bad.status, 502);
  const body = await bad.json();
  assert.equal(body.code, 'GMAIL_SEND_FAILED');
  assert.match(body.hint, /Gmail API/);
});

test('قالب پیام: بدنهٔ base64 در خطوط حداکثر ۷۶ نویسه‌ای است و درست رمزگشایی می‌شود', () => {
  const text = 'سلام. '.repeat(60) + 'https://mokhtari.ir/#/verify?token=abc';
  const raw = buildRawMessage({ from: 'f@example.com', to: 'u@example.com', subject: 'تأیید', text });
  const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const [, body] = decoded.split('\r\n\r\n');
  for (const line of body.split('\r\n')) assert.ok(line.length <= 76, `خط بلندتر از ۷۶: ${line.length}`);
  assert.equal(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), text);
});

test('تشخیص هوش مصنوعی: فقط مدیر؛ نتیجهٔ مدل اصلی و جایگزین بدون افشای کلید', { skip }, async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes('gemini-2.5-flash:')
    ? new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'secret detail' } }), { status: 403 })
    : new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
  try {
    const { env, sent } = setup({ GEMINI_API_KEY: 'AIza-test-key-0123456789', GEMINI_TEXT_MODEL: 'gemini-2.5-flash' });
    assert.equal((await call(env, '/api/admin/ai/status', { method: 'GET' })).status, 401);
    const user = await loginAs(env, sent, 'user@example.com');
    assert.equal((await call(env, '/api/admin/ai/status', { method: 'GET', cookie: user })).status, 403);
    const admin = await loginAs(env, sent, 'admin@example.com');
    const res = await call(env, '/api/admin/ai/status', { method: 'GET', cookie: admin });
    const text = await res.text();
    const body = JSON.parse(text);
    assert.equal(body.configured, true);
    const [primary, fallback] = body.models;
    assert.equal(primary.role, 'اصلی');
    assert.equal(primary.ok, false);
    assert.equal(primary.httpStatus, 403);
    assert.equal(primary.reason, 'PERMISSION_DENIED');
    assert.equal(fallback.ok, true);
    assert.ok(!text.includes('AIza-test-key') && !text.includes('secret detail'));
  } finally {
    globalThis.fetch = original;
  }
});
