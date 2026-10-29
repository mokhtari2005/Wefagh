// تست ارسال Gmail با fetch ساختگی: خطاهای قابل‌لاگ، امن بودن لاگ، و محتوای پیام خام. بدون شبکه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail } from '../worker/src/email/gmail.js';
import { logError } from '../worker/src/auth/routes.js';

const SECRET_ENV = {
  GMAIL_CLIENT_ID: 'CID-visible-public',
  GMAIL_CLIENT_SECRET: 'CSEC-do-not-log',
  GMAIL_REFRESH_TOKEN: 'RT-do-not-log',
  GMAIL_FROM: 'vefagh.lawyers@gmail.com',
};
const SECRETS = ['CSEC-do-not-log', 'RT-do-not-log', 'AT-do-not-log'];

const oauth = (status, body) => async (url) =>
  url.includes('oauth2')
    ? new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
    : new Response('{}', { status: 200 });

async function failureOf(fetchImpl, env = SECRET_ENV) {
  try {
    await sendMail({ env, to: 'u@example.com', subject: 's', text: 't', fetchImpl });
  } catch (err) {
    return err;
  }
  assert.fail('انتظار خطا می‌رفت');
}

test('توکن: invalid_grant با وضعیت HTTP ثبت می‌شود و Secret در خطا نیست', async () => {
  const err = await failureOf(oauth(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }));
  assert.equal(err.message, 'GMAIL_TOKEN_FAILED');
  assert.equal(err.status, 400);
  assert.equal(err.reason, 'invalid_grant');
  const dump = JSON.stringify({ message: err.message, status: err.status, reason: err.reason, stack: err.stack });
  for (const s of SECRETS) assert.ok(!dump.includes(s));
});

test('ارسال: دلیل Gmail از errors[0].reason خوانده می‌شود', async () => {
  const fetchImpl = async (url) =>
    url.includes('oauth2')
      ? new Response(JSON.stringify({ access_token: 'AT-do-not-log' }), { status: 200 })
      : new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', errors: [{ reason: 'insufficientPermissions' }] } }), { status: 403 });
  const err = await failureOf(fetchImpl);
  assert.equal(err.message, 'GMAIL_SEND_FAILED');
  assert.equal(err.status, 403);
  assert.equal(err.reason, 'insufficientPermissions');
});

test('بدنهٔ غیر JSON فقط وضعیت HTTP ثبت می‌کند', async () => {
  const fetchImpl = async (url) =>
    url.includes('oauth2')
      ? new Response('<html>denied</html>', { status: 503 })
      : new Response('{}', { status: 200 });
  const err = await failureOf(fetchImpl);
  assert.equal(err.message, 'GMAIL_TOKEN_FAILED');
  assert.equal(err.status, 503);
  assert.equal(err.reason, undefined);
});

test('دلیل غیرایمن (متن آزاد یا توکن) هرگز ثبت نمی‌شود', async () => {
  const err = await failureOf(oauth(400, { error: 'ya29.leaked token with spaces' }));
  assert.equal(err.reason, undefined);
  assert.equal(err.status, 400);
});

test('تنظیمات ناقص: MAIL_NOT_CONFIGURED و بدون تماس با شبکه', async () => {
  let called = false;
  const err = await failureOf(async () => {
    called = true;
    return new Response('{}');
  }, { ...SECRET_ENV, GMAIL_REFRESH_TOKEN: '' });
  assert.equal(err.message, 'MAIL_NOT_CONFIGURED');
  assert.equal(called, false);
});

test('پیام خام: From همان GMAIL_FROM است و موضوع فارسی درست کدگذاری می‌شود', async () => {
  let raw;
  const fetchImpl = async (url, opts) => {
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'AT-do-not-log' }), { status: 200 });
    raw = JSON.parse(opts.body).raw;
    return new Response('{}', { status: 200 });
  };
  await sendMail({ env: SECRET_ENV, to: 'u@example.com', subject: 'تأیید حساب وِفاق', text: 'سلام', fetchImpl });
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  assert.match(decoded, /^From: vefagh\.lawyers@gmail\.com\r\n/m);
  assert.match(decoded, /^To: u@example\.com\r\n/m);
  assert.match(decoded, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/m);
});

test('logError شامل وضعیت و دلیل امن است و هیچ Secret یا متن آزاد ندارد', async () => {
  const lines = [];
  const orig = console.error;
  console.error = (l) => lines.push(String(l));
  try {
    const err = await failureOf(oauth(400, { error: 'invalid_grant' }));
    logError('auth.send_verification', err);
  } finally {
    console.error = orig;
  }
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.where, 'auth.send_verification');
  assert.equal(entry.status, 400);
  assert.equal(entry.reason, 'invalid_grant');
  for (const s of SECRETS) assert.ok(!lines[0].includes(s));
});

test('تنظیمات ناقص: نام متغیرهای خالی در خطا و لاگ است، بدون مقدار', async () => {
  const err = await failureOf(async () => new Response('{}'), { ...SECRET_ENV, GMAIL_REFRESH_TOKEN: '', GMAIL_FROM: '' });
  assert.equal(err.message, 'MAIL_NOT_CONFIGURED');
  assert.deepEqual(err.missing, ['GMAIL_REFRESH_TOKEN', 'GMAIL_FROM']);
  const lines = [];
  const orig = console.error;
  console.error = (l) => lines.push(String(l));
  try {
    logError('auth.send_verification', err);
  } finally {
    console.error = orig;
  }
  const entry = JSON.parse(lines[0]);
  assert.deepEqual(entry.missing, ['GMAIL_REFRESH_TOKEN', 'GMAIL_FROM']);
  for (const s of SECRETS.concat(['vefagh.lawyers@gmail.com'])) assert.ok(!lines[0].includes(s));
});
