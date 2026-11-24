// تست مسیر واقعی ایمیل ثبت‌نام (Resend) و ابزارهای مدیریتی حساب؛ بدون شبکهٔ واقعی.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';

let DatabaseSync;
let sqliteAvailable = true;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { sqliteAvailable = false; }
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');

function d1Like(db) {
  return { prepare(sql) {
    const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
    return { bind(...args) {
      return {
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ success: true, results: stmt.all(...args) }),
        run: async () => { if (/RETURNING/i.test(sql)) return { success: true, results: stmt.all(...args) }; stmt.run(...args); return { success: true, results: [] }; },
      };
    }};
  }};
}
function setup(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of ['0001_init.sql','0002_auth.sql','0008_registration_profile.sql','0014_member_identity.sql']) db.exec(migration(f));
  const sent = [];
  const env = { DB: d1Like(db), PUBLIC_BASE_URL: 'https://mokhtari.ir', ADMIN_EMAIL: 'admin@example.com', mailer: async (msg) => { sent.push(msg); }, ...extra };
  return { db, env, sent };
}
async function call(env, path, { method = 'POST', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(`https://mokhtari.ir${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }), env);
}
async function loginAs(env, sent, email) {
  const user = { email, password: 'رمز-امن-۱۴۰۵', displayName: 'کاربر آزمایشی' };
  await call(env, '/api/auth/register', { body: user });
  const token = sent.at(-1).text.match(/token=([A-Za-z0-9_-]+)/)[1];
  await call(env, '/api/auth/verify-email', { body: { token } });
  const res = await call(env, '/api/auth/login', { body: { email, password: user.password } });
  return `wefagh_session=${/wefagh_session=([^;]+)/.exec(res.headers.get('set-cookie'))[1]}`;
}
test('تشخیص ایمیل: فقط مدیر به وضعیت و آزمون Resend دسترسی دارد', { skip }, async () => {
  const { env, sent } = setup();
  assert.equal((await call(env, '/api/admin/mail/status', { method: 'GET' })).status, 401);
  const user = await loginAs(env, sent, 'user@example.com');
  assert.equal((await call(env, '/api/admin/mail/status', { method: 'GET', cookie: user })).status, 403);
  assert.equal((await call(env, '/api/admin/mail/test', { cookie: user, body: {} })).status, 403);
});
test('وضعیت ایمیل، Secret واقعی Resend را بررسی می‌کند نه تنظیمات Gmail را', { skip }, async () => {
  const { env, sent } = setup({ GMAIL_CLIENT_ID: 'old-gmail-config' });
  const admin = await loginAs(env, sent, 'admin@example.com');
  const body = await (await call(env, '/api/admin/mail/status', { method: 'GET', cookie: admin })).json();
  assert.equal(body.configured, false);
  assert.deepEqual(body.missing, ['RESEND_API_KEY']);
  env.RESEND_API_KEY = 're_test_secret_value';
  const configured = await (await call(env, '/api/admin/mail/status', { method: 'GET', cookie: admin })).json();
  assert.equal(configured.configured, true);
  assert.ok(!JSON.stringify(configured).includes('re_test_secret'));
});
test('آزمون ایمیل از همان سرویس Resend مورد استفاده در ثبت‌نام عبور می‌کند', { skip }, async () => {
  const { env, sent } = setup();
  const admin = await loginAs(env, sent, 'admin@example.com');
  delete env.mailer;
  env.RESEND_API_KEY = 're_test_secret_value';
  let request;
  env.fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email_test_123' }), { status: 200 });
  };
  const res = await call(env, '/api/admin/mail/test', { cookie: admin, body: {} });
  assert.equal(res.status, 200);
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.Authorization, 'Bearer re_test_secret_value');
  assert.match(request.options.body, /admin@example.com/);
});
test('خطای ۴۰۳ Resend راهنمای درست و بدون افشای کلید می‌دهد', { skip }, async () => {
  const { env, sent } = setup();
  const admin = await loginAs(env, sent, 'admin@example.com');
  env.mailer = async () => { throw Object.assign(new Error('RESEND_SEND_FAILED'), { status: 403 }); };
  const res = await call(env, '/api/admin/mail/test', { cookie: admin, body: {} });
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(body.code, 'RESEND_SEND_FAILED');
  assert.match(body.hint, /Resend/);
});
test('بررسی وضعیت حساب: وجود حساب و وضعیت تأیید بدون افشای نشانی ایمیل', { skip }, async () => {
  const { env, sent } = setup();
  const admin = await loginAs(env, sent, 'admin@example.com');
  await call(env, '/api/auth/register', { body: { email: 'person@example.com', password: 'رمز-امن-۱۴۰۵', displayName: 'کاربر نمونه' } });
  const res = await call(env, '/api/admin/mail/account-status', { cookie: admin, body: { email: 'person@example.com' } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.found, true);
  assert.equal(body.verified, false);
  assert.equal(body.resendAllowed, false);
  assert.ok(!JSON.stringify(body).includes('person@example.com'));
  const missing = await call(env, '/api/admin/mail/account-status', { cookie: admin, body: { email: 'missing@example.com' } });
  assert.equal((await missing.json()).found, false);
});
test('ارسال مجدد مدیریتی در دورهٔ محدودیت، درخواست را رد می‌کند', { skip }, async () => {
  const { env, sent } = setup();
  const admin = await loginAs(env, sent, 'admin@example.com');
  await call(env, '/api/auth/register', { body: { email: 'person@example.com', password: 'رمز-امن-۱۴۰۵', displayName: 'کاربر نمونه' } });
  const res = await call(env, '/api/admin/mail/account-resend', { cookie: admin, body: { email: 'person@example.com' } });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'RESEND_COOLDOWN');
});

test('تشخیص هوش مصنوعی: فقط مدیر؛ نتیجهٔ مدل اصلی و جایگزین بدون افشای کلید', { skip }, async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('api.openai.com')) return new Response(JSON.stringify({ error: { message: 'secret detail' } }), { status: 403 });
    if (target.includes('gemini-2.5-flash:')) return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'secret detail' } }), { status: 403 });
    return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
  };
  try {
    const { env, sent } = setup({ OPENAI_API_KEY: 'sk-test-openai-key-0123456789abcdef', GEMINI_API_KEY: 'AIza-test-key-0123456789', GEMINI_TEXT_MODEL: 'gemini-2.5-flash' });
    assert.equal((await call(env, '/api/admin/ai/status', { method: 'GET' })).status, 401);
    const user = await loginAs(env, sent, 'user@example.com');
    assert.equal((await call(env, '/api/admin/ai/status', { method: 'GET', cookie: user })).status, 403);
    const admin = await loginAs(env, sent, 'admin@example.com');
    const res = await call(env, '/api/admin/ai/status', { method: 'GET', cookie: admin });
    const text = await res.text();
    const body = JSON.parse(text);
    assert.equal(body.configured, true);
    const [primary, geminiPrimary, fallback] = body.models;
    assert.equal(primary.provider, 'openai');
    assert.equal(primary.role, 'اصلی');
    assert.equal(primary.ok, false);
    assert.equal(primary.code, 'AI_KEY_REJECTED');
    assert.equal(geminiPrimary.provider, 'gemini');
    assert.equal(geminiPrimary.ok, false);
    assert.equal(geminiPrimary.httpStatus, 403);
    assert.equal(geminiPrimary.reason, 'PERMISSION_DENIED');
    assert.equal(fallback.ok, true);
    assert.ok(!text.includes('AIza-test-key') && !text.includes('secret detail'));
  } finally {
    globalThis.fetch = original;
  }
});
