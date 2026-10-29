// تست یکپارچه: مسیرهای احراز هویت روی SQLite واقعی (node:sqlite) و ایمیل ساختگی.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';

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

// آداپتور D1 روی node:sqlite: واسط first / all / run مانند D1.
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

function setup({ adminEmail } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0008_registration_profile.sql'));
  const sent = [];
  const env = {
    DB: d1Like(db),
    PUBLIC_BASE_URL: 'https://wefagh.ir',
    ADMIN_EMAIL: adminEmail,
    mailer: async (msg) => {
      sent.push(msg);
    },
  };
  return { db, env, sent };
}

async function call(env, path, { method = 'POST', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const req = new Request(`https://wefagh.ir${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, env);
}

const validProfile = {
  phone: '۰۹۱۲۳۴۵۶۷۸۹',
  province: 'تهران',
  city: 'تهران',
  professionalStatus: 'trainee',
  barAssociation: 'کانون وکلای دادگستری تهران',
  licenseNumber: '',
  licenseYear: '',
  experienceBand: 'under_2',
  practiceAreas: ['civil', 'contracts'],
  learningGoal: 'licence_exam',
  skillAreas: ['pleadings'],
  skillLevel: 'beginner',
  learningFormat: 'case_based',
  notes: '',
};
const validUser = {
  email: 'Shahram@Example.com',
  password: 'رمز-امن-۱۴۰۵',
  displayName: 'شهرام مختاری',
  profile: validProfile,
};

function tokenFromMail(sent) {
  const m = sent.at(-1).text.match(/token=([A-Za-z0-9_-]+)/);
  return m?.[1];
}

function sessionCookieFrom(res) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/wefagh_session=([^;]+)/);
  return m ? `wefagh_session=${m[1]}` : null;
}

test('ثبت‌نام: ایمیل با حروف کوچک ذخیره، رمز هش، و ایمیل تأیید ارسال می‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  const res = await call(env, '/api/auth/register', { body: validUser });
  assert.equal(res.status, 202);
  const row = db.prepare('SELECT email, password_hash, email_verified_at FROM users').get();
  assert.equal(row.email, 'shahram@example.com');
  assert.ok(row.password_hash.startsWith('pbkdf2$'));
  assert.ok(!row.password_hash.includes(validUser.password));
  assert.equal(row.email_verified_at, null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'shahram@example.com');
  assert.ok(tokenFromMail(sent));
});

test('ثبت‌نام با ایمیل تکراری همان پاسخ عمومی را می‌دهد و کاربر جدید نمی‌سازد', { skip }, async () => {
  const { db, env, sent } = setup();
  const first = await call(env, '/api/auth/register', { body: validUser });
  const second = await call(env, '/api/auth/register', { body: validUser });
  assert.equal(second.status, first.status);
  assert.equal((await second.json()).message, (await first.json()).message);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(sent.length, 1, 'ایمیل دوم نباید ارسال شود');
});

test('ورودی نامعتبر در ثبت‌نام با ۴۲۲ و خطاهای فیلدی رد می‌شود', { skip }, async () => {
  const { db, env } = setup();
  const res = await call(env, '/api/auth/register', { body: { email: 'bad', password: 'short', displayName: 'ا' } });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(body.errors.email && body.errors.password && body.errors.displayName);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

test('ورود قبل از تأیید ایمیل با ۴۰۳ رد می‌شود', { skip }, async () => {
  const { env } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const res = await call(env, '/api/auth/login', { body: { email: validUser.email, password: validUser.password } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'EMAIL_NOT_VERIFIED');
});

test('تأیید ایمیل با توکن یک‌بارمصرف کار می‌کند؛ استفادهٔ دوباره رد می‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const token = tokenFromMail(sent);
  const ok = await call(env, '/api/auth/verify-email', { body: { token } });
  assert.equal(ok.status, 200);
  assert.ok(db.prepare('SELECT email_verified_at FROM users').get().email_verified_at);
  const again = await call(env, '/api/auth/verify-email', { body: { token } });
  assert.equal(again.status, 400);
  assert.equal((await again.json()).error, 'INVALID_TOKEN');
});

test('توکن تأیید در دیتابیس فقط به‌صورت هش ذخیره می‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const token = tokenFromMail(sent);
  const rows = db.prepare('SELECT token_hash FROM email_tokens').all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.equal(rows[0].token_hash.length, 64);
});

test('ورود موفق: کوکی HttpOnly امن ست می‌شود و نشست فقط هش توکن را دارد', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/verify-email', { body: { token: tokenFromMail(sent) } });
  const res = await call(env, '/api/auth/login', { body: { email: validUser.email, password: validUser.password } });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  const raw = sessionCookieFrom(res).split('=')[1];
  const stored = db.prepare('SELECT token_hash FROM sessions').get().token_hash;
  assert.notEqual(stored, raw);
});

test('رمز اشتباه و ایمیل ناموجود، پاسخ یکسان دارند (عدم افشای وجود حساب)', { skip }, async () => {
  const { env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/verify-email', { body: { token: tokenFromMail(sent) } });
  const wrongPass = await call(env, '/api/auth/login', { body: { email: validUser.email, password: 'اشتباه-اشتباه-۱' } });
  const noUser = await call(env, '/api/auth/login', { body: { email: 'nobody@example.com', password: 'اشتباه-اشتباه-۱' } });
  assert.equal(wrongPass.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal((await wrongPass.json()).error, (await noUser.json()).error);
});

test('پس از ۵ تلاش ناموفق حساب قفل می‌شود و ورود درست هم ۴۲۳ می‌دهد', { skip }, async () => {
  const { env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/verify-email', { body: { token: tokenFromMail(sent) } });
  for (let i = 0; i < 5; i++) {
    await call(env, '/api/auth/login', { body: { email: validUser.email, password: 'بد-بد-بد-بد-۱' } });
  }
  const locked = await call(env, '/api/auth/login', { body: { email: validUser.email, password: validUser.password } });
  assert.equal(locked.status, 423);
  assert.equal((await locked.json()).error, 'ACCOUNT_LOCKED');
});

test('/api/me بدون کوکی ۴۰۱ و با کوکی معتبر اطلاعات کاربر و نقش‌ها را برمی‌گرداند', { skip }, async () => {
  const { env, sent } = setup({ adminEmail: validUser.email });
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/verify-email', { body: { token: tokenFromMail(sent) } });
  const login = await call(env, '/api/auth/login', { body: { email: validUser.email, password: validUser.password } });
  const cookie = sessionCookieFrom(login);

  const anon = await call(env, '/api/me', { method: 'GET' });
  assert.equal(anon.status, 401);

  const me = await call(env, '/api/me', { method: 'GET', cookie });
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.user.email, 'shahram@example.com');
  assert.deepEqual(body.user.roles, ['super_admin']);
});

test('ادمین اصلی با ثبت‌نام همان ایمیل نقش super_admin می‌گیرد؛ کاربر عادی نمی‌گیرد', { skip }, async () => {
  const { db, env } = setup({ adminEmail: 'Shahram@Example.com' });
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/register', { body: { ...validUser, email: 'other@example.com' } });
  const roles = db
    .prepare('SELECT u.email, r.role FROM user_roles r JOIN users u ON u.id = r.user_id')
    .all()
    .map((r) => ({ email: r.email, role: r.role })); // تبدیل به شیء معمولی برای مقایسه
  assert.deepEqual(roles, [{ email: 'shahram@example.com', role: 'super_admin' }]);
});

test('خروج نشست را حذف می‌کند و /api/me بعد از آن ۴۰۱ می‌دهد', { skip }, async () => {
  const { env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/verify-email', { body: { token: tokenFromMail(sent) } });
  const login = await call(env, '/api/auth/login', { body: { email: validUser.email, password: validUser.password } });
  const cookie = sessionCookieFrom(login);
  const out = await call(env, '/api/auth/logout', { cookie });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  const me = await call(env, '/api/me', { method: 'GET', cookie });
  assert.equal(me.status, 401);
});

test('نشست منقضی‌شده قبول نمی‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  await call(env, '/api/auth/verify-email', { body: { token: tokenFromMail(sent) } });
  const login = await call(env, '/api/auth/login', { body: { email: validUser.email, password: validUser.password } });
  const cookie = sessionCookieFrom(login);
  db.exec("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'");
  const me = await call(env, '/api/me', { method: 'GET', cookie });
  assert.equal(me.status, 401);
});

test('متد اشتباه روی مسیر احراز هویت با ۴۰۵ رد می‌شود', { skip }, async () => {
  const { env } = setup();
  const res = await call(env, '/api/auth/login', { method: 'GET' });
  assert.equal(res.status, 405);
});

// ---- ارسال ایمیل تأیید: خطای سرویس، ارسال مجدد، انقضا ----

function ageTokens(db, minutes) {
  db.prepare("UPDATE email_tokens SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)").run(`-${minutes} minutes`);
}

test('خطای سرویس ایمیل ثبت‌نام را خراب نمی‌کند: پاسخ عمومی، کاربر ساخته و لاگ ثبت می‌شود', { skip }, async () => {
  const { db, env } = setup();
  const logs = [];
  const orig = console.error;
  console.error = (line) => logs.push(String(line));
  env.mailer = async () => {
    throw new Error('MAIL_NOT_CONFIGURED');
  };
  try {
    const res = await call(env, '/api/auth/register', { body: validUser });
    assert.equal(res.status, 202);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    assert.ok(logs.some((l) => l.includes('auth.send_verification') && l.includes('MAIL_NOT_CONFIGURED')));
    assert.ok(!logs.some((l) => /token=/.test(l)), 'لاگ نباید توکن را داشته باشد');
  } finally {
    console.error = orig;
  }
});

test('ارسال مجدد: برای حساب تأییدنشده ایمیل تازه می‌فرستد و لینک قبلی باطل می‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const oldToken = tokenFromMail(sent);
  ageTokens(db, 2);

  const res = await call(env, '/api/auth/resend-verification', { body: { email: 'shahram@example.com' } });
  assert.equal(res.status, 202);
  assert.equal(sent.length, 2);
  const newToken = tokenFromMail(sent);
  assert.notEqual(newToken, oldToken);

  const stale = await call(env, '/api/auth/verify-email', { body: { token: oldToken } });
  assert.equal(stale.status, 400);
  const fresh = await call(env, '/api/auth/verify-email', { body: { token: newToken } });
  assert.equal(fresh.status, 200);
  assert.ok(db.prepare('SELECT email_verified_at FROM users').get().email_verified_at);
});

test('ارسال مجدد در کمتر از یک دقیقه ایمیل تکراری نمی‌فرستد', { skip }, async () => {
  const { env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const res = await call(env, '/api/auth/resend-verification', { body: { email: validUser.email } });
  assert.equal(res.status, 202);
  assert.equal(sent.length, 1);
});

test('ارسال مجدد برای ایمیل ناموجود یا حساب تأییدشده ایمیلی نمی‌فرستد و پاسخ یکسان است', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const token = tokenFromMail(sent);
  await call(env, '/api/auth/verify-email', { body: { token } });

  const verified = await call(env, '/api/auth/resend-verification', { body: { email: validUser.email } });
  const unknown = await call(env, '/api/auth/resend-verification', { body: { email: 'nobody@example.com' } });
  assert.equal(verified.status, 202);
  assert.equal(unknown.status, 202);
  assert.equal((await verified.json()).message, (await unknown.json()).message);
  assert.equal(sent.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
});

test('ارسال مجدد با ایمیل نامعتبر ۴۲۲ می‌دهد', { skip }, async () => {
  const { env } = setup();
  const res = await call(env, '/api/auth/resend-verification', { body: { email: 'not-an-email' } });
  assert.equal(res.status, 422);
});

test('توکن تأیید منقضی‌شده رد می‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: validUser });
  const token = tokenFromMail(sent);
  db.prepare("UPDATE email_tokens SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minutes')").run();
  const res = await call(env, '/api/auth/verify-email', { body: { token } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'INVALID_TOKEN');
});

test('ارسال مجدد پس از خطای سرویس، حساب گیرکرده را آزاد می‌کند', { skip }, async () => {
  const { db, env, sent } = setup();
  const failing = env.mailer;
  env.mailer = async () => {
    throw new Error('GMAIL_SEND_FAILED');
  };
  const orig = console.error;
  console.error = () => {};
  try {
    await call(env, '/api/auth/register', { body: validUser });
  } finally {
    console.error = orig;
  }
  env.mailer = failing;
  ageTokens(db, 2);
  await call(env, '/api/auth/resend-verification', { body: { email: validUser.email } });
  assert.equal(sent.length, 1);
  const token = tokenFromMail(sent);
  const ok = await call(env, '/api/auth/verify-email', { body: { token } });
  assert.equal(ok.status, 200);
});
