// تست Resend با fetch ساختگی؛ بدون شبکه و بدون افشای API Key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from '../worker/src/email/resend.js';
import { logError } from '../worker/src/auth/routes.js';

const KEY = 're_secret_never_log';
const env = { RESEND_API_KEY: KEY, RESEND_FROM: 'Vefagh Law Society <noreply@mokhtari.ir>' };
const call = (fetchImpl, e = env) => sendMail({
  env: e, to: 'user@example.com', subject: 'تأیید حساب وِفاق', text: 'لینک تأیید', fetchImpl,
});

test('ارسال موفق: درخواست استاندارد Resend و فرستنده دامنه وفاق', async () => {
  let request;
  await call(async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email-id' }), { status: 200 });
  });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(request.options.body);
  assert.equal(body.from, 'Vefagh Law Society <noreply@mokhtari.ir>');
  assert.deepEqual(body.to, ['user@example.com']);
  assert.equal(body.subject, 'تأیید حساب وِفاق');
});

test('فرستندهٔ صریح درخواست بر تنظیم پیش‌فرض Resend اولویت دارد', async () => {
  let payload;
  await sendMail({ env, from: 'Mokhtari Law Academy <edu@mokhtari.ir>', to: 'user@example.com', subject: 'بازیابی رمز', text: 'لینک', fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return new Response('{}', { status: 200 }); } });
  assert.equal(payload.from, 'Mokhtari Law Academy <edu@mokhtari.ir>');
});

test('اعتبارسنجی سربرگ فقط CR و LF واقعی را رد می‌کند، نه حروف r و n', async () => {
  let called = false;
  const ok = await sendMail({
    env: { RESEND_API_KEY: KEY },
    to: 'user@example.com',
    subject: 'Normal registration notice',
    text: 'hello',
    fetchImpl: async () => { called = true; return new Response('{}', { status: 200 }); },
  });
  assert.deepEqual(ok, { ok: true });
  assert.equal(called, true);
  await assert.rejects(sendMail({
    env: { RESEND_API_KEY: KEY },
    to: 'user@example.com\r\nBcc:bad@example.com',
    subject: 'test',
    text: 'x',
    fetchImpl: async () => { throw new Error('network must not be called'); },
  }), /INVALID_MAIL_HEADER/);
});

test('خطای Resend فقط کد امن و وضعیت را نگه می‌دارد؛ کلید افشا نمی‌شود', async () => {
  let err;
  try {
    await call(async () => new Response(JSON.stringify({ name: 'validation_error', message: KEY }), { status: 422 }));
  } catch (e) { err = e; }
  assert.equal(err.message, 'RESEND_SEND_FAILED');
  assert.equal(err.status, 422);
  assert.equal(err.reason, 'validation_error');
  assert.ok(!JSON.stringify(err).includes(KEY));
});

test('کلید تنظیم‌نشده بدون تماس شبکه گزارش می‌شود', async () => {
  let called = false, err;
  try { await call(async () => { called = true; return new Response('{}'); }, {}); } catch (e) { err = e; }
  assert.equal(called, false);
  assert.equal(err.message, 'MAIL_NOT_CONFIGURED');
  assert.deepEqual(err.missing, ['RESEND_API_KEY']);
});

test('لاگ خطای ارسال نام متغیر را نشان می‌دهد، نه مقدار Secret را', async () => {
  let err;
  try { await call(async () => new Response('{}', { status: 401 })); } catch (e) { err = e; }
  const lines = [], old = console.error;
  console.error = (line) => lines.push(String(line));
  try { logError('auth.send_verification', err); } finally { console.error = old; }
  assert.ok(!lines[0].includes(KEY));
  assert.equal(JSON.parse(lines[0]).status, 401);
});
