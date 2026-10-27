import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  PASSWORD_MIN,
} from '../worker/src/auth/password.js';
import { generateToken, hashToken, addMs, SESSION_TTL_MS } from '../worker/src/auth/token.js';
import { encodeHeaderUtf8, buildRawMessage, sendMail } from '../worker/src/email/gmail.js';

// ---------- رمز عبور ----------

test('هش و بررسی رمز: رمز درست پذیرفته و رمز غلط رد می‌شود', async () => {
  const stored = await hashPassword('رمز-خیلی-امن-۱۴۰۵', { iterations: 1000 });
  assert.equal(await verifyPassword('رمز-خیلی-امن-۱۴۰۵', stored), true);
  assert.equal(await verifyPassword('رمز-اشتباه-۱۲۳', stored), false);
});

test('هر هش نمک متفاوت دارد، پس دو هش یکسان نیستند', async () => {
  const a = await hashPassword('یک-رمز-یکسان', { iterations: 1000 });
  const b = await hashPassword('یک-رمز-یکسان', { iterations: 1000 });
  assert.notEqual(a, b);
});

test('قالب هش در فرمت pbkdf2 است و خود رمز در آن نیست', async () => {
  const stored = await hashPassword('secret-password-x', { iterations: 1000 });
  assert.match(stored, /^pbkdf2\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!stored.includes('secret-password-x'));
});

test('هش دستکاری‌شده یا قالب نامعتبر رد می‌شود و خطا نمی‌دهد', async () => {
  const stored = await hashPassword('valid-password-1', { iterations: 1000 });
  const tampered = stored.slice(0, -4) + 'AAAA';
  assert.equal(await verifyPassword('valid-password-1', tampered), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
  assert.equal(await verifyPassword('x', 'pbkdf2$5$a$b'), false); // تکرار خیلی کم
  assert.equal(await verifyPassword(null, stored), false);
});

test('سیاست رمز: کوتاه و غیررشته رد می‌شوند', () => {
  assert.equal(validatePasswordPolicy('short').ok, false);
  assert.equal(validatePasswordPolicy('a'.repeat(PASSWORD_MIN)).ok, true);
  assert.equal(validatePasswordPolicy(12345678901234).ok, false);
  assert.equal(validatePasswordPolicy('a'.repeat(129)).ok, false);
});

// ---------- توکن ----------

test('توکن‌ها تصادفی و طولانی‌اند و فقط نویسه‌های امن URL دارند', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 42);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('هش توکن ثابت و SHA-256 (۶۴ نویسه hex) است', async () => {
  const h1 = await hashToken('abc');
  const h2 = await hashToken('abc');
  assert.equal(h1, h2);
  assert.equal(h1, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('زمان انقضای نشست ۳۰ روز بعد است', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const exp = new Date(addMs(now, SESSION_TTL_MS));
  assert.equal(exp.toISOString(), '2026-11-26T12:00:00.000Z');
});

// ---------- ایمیل Gmail ----------

test('عنوان فارسی به RFC 2047 با UTF-8 کد می‌شود و برمی‌گردد', () => {
  const encoded = encodeHeaderUtf8('تأیید حساب وِفاق');
  assert.match(encoded, /^=\?UTF-8\?B\?.+\?=$/);
  const b64 = encoded.slice('=?UTF-8?B?'.length, -2);
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  assert.equal(decoded, 'تأیید حساب وِفاق');
});

test('هدر دارای خط جدید (تزریق هدر) رد می‌شود', () => {
  assert.throws(() => buildRawMessage({ from: 'a@b.cc', to: 'x@y.zz\r\nBcc: evil@x.zz', subject: 's', text: 't' }));
  assert.throws(() => buildRawMessage({ from: 'a@b.cc', to: 'x@y.zz', subject: 'ok\nBcc: e@x.zz', text: 't' }));
});

test('پیام خام به base64url تبدیل و قابل خواندن است', () => {
  const raw = buildRawMessage({ from: 'Vefagh.lawyers@gmail.com', to: 'u@example.com', subject: 'تست', text: 'سلام' });
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(decoded, /^From: Vefagh\.lawyers@gmail\.com/m);
  assert.match(decoded, /^To: u@example\.com/m);
});

test('sendMail بدون تنظیمات، خطای MAIL_NOT_CONFIGURED می‌دهد', async () => {
  await assert.rejects(
    sendMail({ env: {}, to: 'u@example.com', subject: 's', text: 't' }),
    /MAIL_NOT_CONFIGURED/
  );
});

test('sendMail با fetch ساختگی: ابتدا توکن می‌گیرد و سپس پیام می‌فرستد', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('oauth2')) {
      return new Response(JSON.stringify({ access_token: 'AT-123' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const env = {
    GMAIL_CLIENT_ID: 'cid',
    GMAIL_CLIENT_SECRET: 'csec',
    GMAIL_REFRESH_TOKEN: 'rt',
    GMAIL_FROM: 'Vefagh.lawyers@gmail.com',
  };
  const res = await sendMail({ env, to: 'u@example.com', subject: 'تأیید', text: 'کد', fetchImpl: fakeFetch });
  assert.deepEqual(res, { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /gmail\.googleapis\.com/);
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer AT-123');
});

test('خطای Gmail به‌صورت خطای عمومی برمی‌گردد و جزئیات افشا نمی‌شود', async () => {
  const fakeFetch = async (url) =>
    url.includes('oauth2')
      ? new Response(JSON.stringify({ access_token: 'AT' }), { status: 200 })
      : new Response('secret internal detail', { status: 500 });
  const env = { GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b', GMAIL_REFRESH_TOKEN: 'c', GMAIL_FROM: 'd@e.ff' };
  await assert.rejects(
    sendMail({ env, to: 'u@example.com', subject: 's', text: 't', fetchImpl: fakeFetch }),
    (err) => err.message === 'GMAIL_SEND_FAILED' && !String(err.message).includes('secret')
  );
});

// ---------- مهاجرت احراز هویت روی SQLite واقعی ----------

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');

let DatabaseSync;
let sqliteAvailable = true;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  sqliteAvailable = false;
}
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';

test('مهاجرت ۰۰۰۲ روی SQLite اجرا می‌شود و جداول احراز هویت را می‌سازد', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(read('0001_init.sql'));
  db.exec(read('0002_auth.sql'));
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  for (const t of ['users', 'sessions', 'email_tokens', 'user_roles', 'contact_messages']) {
    assert.ok(names.includes(t), `جدول ${t} باید وجود داشته باشد`);
  }
});

test('ایمیل تکراری (بدون توجه به بزرگی و کوچکی حروف) پذیرفته نمی‌شود', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(read('0002_auth.sql'));
  db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run('a@b.cc', 'h', 'علی');
  assert.throws(() =>
    db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run('A@B.CC', 'h', 'رضا')
  );
});

test('نقش نامعتبر و وضعیت نامعتبر کاربر در دیتابیس رد می‌شوند', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(read('0002_auth.sql'));
  const u = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?) RETURNING id').get('x@y.zz', 'h', 'سارا');
  assert.throws(() => db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?,?)').run(u.id, 'hacker'));
  assert.throws(() =>
    db.prepare("INSERT INTO users (email, password_hash, display_name, status) VALUES (?,?,?,?)").run('z@y.zz', 'h', 'ن', 'x')
  );
});

test('حذف کاربر، نشست و نقش‌هایش را هم حذف می‌کند (ON DELETE CASCADE)', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(read('0002_auth.sql'));
  const u = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?) RETURNING id').get('c@d.ee', 'h', 'مریم');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run('t1', u.id, '2030-01-01T00:00:00Z');
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'super_admin')").run(u.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_roles').get().n, 0);
});
