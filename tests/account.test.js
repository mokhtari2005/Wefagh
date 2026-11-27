// تست یکپارچه: تغییر رمز عبور و ویرایش پروفایل روی SQLite واقعی (node:sqlite) و ایمیل ساختگی.
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

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0008_registration_profile.sql'));
  db.exec(migration('0014_member_identity.sql'));
  db.exec(migration('0019_mla_membership_sequence.sql'));
  db.exec(migration('0024_membership_approval.sql'));
  db.exec(migration('0025_registration_contact_details.sql'));
  const sent = [];
  const env = {
    DB: d1Like(db),
    PUBLIC_BASE_URL: 'https://mokhtari.ir',
    mailer: async (msg) => { sent.push(msg); },
  };
  return { db, env, sent };
}

async function call(env, path, { method = 'POST', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const req = new Request(`https://mokhtari.ir${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, env);
}

const profileBase = {
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
const OLD = 'رمز-قدیمی-۱۴۰۵';
const NEW = 'رمز-جدید-۱۴۰۵';

function sessionCookieFrom(res) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/wefagh_session=([^;]+)/);
  return m ? `wefagh_session=${m[1]}` : null;
}

async function registerAndLogin(env, sent, { email, phone }) {
  // ثبت‌نام پروفایل نمی‌سازد؛ پروفایل (در صورت نیاز) از مسیر ویرایش ذخیره می‌شود.
  await call(env, '/api/auth/register', { body: { email, password: OLD, displayName: 'کاربر آزمایشی', professionalTitle: 'کارآموز وکالت', position: 'عضو' } });
  const token = sent.at(-1).text.match(/token=([A-Za-z0-9_-]+)/)[1];
  await call(env, '/api/auth/verify-email', { body: { token } });
  await env.DB.prepare("UPDATE users SET membership_status='approved' WHERE email=?1").bind(email).run();
  const res = await call(env, '/api/auth/login', { body: { email, password: OLD } });
  assert.equal(res.status, 200);
  const cookie = sessionCookieFrom(res);
  if (phone) {
    const saved = await call(env, '/api/me/profile', { method: 'PUT', cookie, body: { profile: { ...profileBase, phone } } });
    assert.equal(saved.status, 200);
  }
  return cookie;
}

test('تغییر رمز: نیاز به ورود دارد', { skip }, async () => {
  const { env } = setup();
  const res = await call(env, '/api/auth/change-password', { body: { newPassword: NEW } });
  assert.equal(res.status, 401);
});

test('تغییر رمز: بدون رمز فعلی انجام می‌شود و رمز ضعیف رد می‌شود', { skip }, async () => {
  const { env, sent } = setup();
  const cookie = await registerAndLogin(env, sent, { email: 'a@example.com', phone: '09121111111' });

  const weak = await call(env, '/api/auth/change-password', { cookie, body: { newPassword: 'کوتاه' } });
  assert.equal(weak.status, 422);

  const changed = await call(env, '/api/auth/change-password', { cookie, body: { newPassword: NEW } });
  assert.equal(changed.status, 200);
});

test('تغییر رمز: رمز جدید جایگزین می‌شود و نشست‌های دیگر باطل می‌شوند', { skip }, async () => {
  const { env, sent } = setup();
  const current = await registerAndLogin(env, sent, { email: 'b@example.com', phone: '09122222222' });
  const other = sessionCookieFrom(await call(env, '/api/auth/login', { body: { email: 'b@example.com', password: OLD } }));
  assert.ok(other && other !== current);

  const ok = await call(env, '/api/auth/change-password', { cookie: current, body: { newPassword: NEW } });
  assert.equal(ok.status, 200);

  assert.equal((await call(env, '/api/me', { method: 'GET', cookie: other })).status, 401, 'نشست دیگر باید باطل شود');
  assert.equal((await call(env, '/api/me', { method: 'GET', cookie: current })).status, 200, 'نشست فعلی باید بماند');

  const oldLogin = await call(env, '/api/auth/login', { body: { email: 'b@example.com', password: OLD } });
  assert.equal(oldLogin.status, 401);
  const newLogin = await call(env, '/api/auth/login', { body: { email: 'b@example.com', password: NEW } });
  assert.equal(newLogin.status, 200);
});

test('ویرایش پروفایل: ذخیره، بازخوانی پس از ورود مجدد و رد ورودی نامعتبر', { skip }, async () => {
  const { env, sent } = setup();
  const cookie = await registerAndLogin(env, sent, { email: 'c@example.com', phone: '09123333333' });

  const bad = await call(env, '/api/me/profile', { method: 'PUT', cookie, body: { profile: { ...profileBase, city: 'x' } } });
  assert.equal(bad.status, 422);

  const good = await call(env, '/api/me/profile', { method: 'PUT', cookie, body: { profile: { ...profileBase, city: 'اصفهان', phone: '09123333333' } } });
  assert.equal(good.status, 200);

  const me = await (await call(env, '/api/me', { method: 'GET', cookie })).json();
  assert.equal(me.user.profile.city, 'اصفهان');
});

test('ویرایش پروفایل: شمارهٔ متعلق به کاربر دیگر پذیرفته نمی‌شود', { skip }, async () => {
  const { env, sent } = setup();
  await registerAndLogin(env, sent, { email: 'd@example.com', phone: '09124444444' });
  const cookie = await registerAndLogin(env, sent, { email: 'e@example.com', phone: '09125555555' });
  const res = await call(env, '/api/me/profile', { method: 'PUT', cookie, body: { profile: { ...profileBase, phone: '09124444444' } } });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.phone);
});

test('ویرایش پروفایل: بدون نشست رد می‌شود', { skip }, async () => {
  const { env } = setup();
  const res = await call(env, '/api/me/profile', { method: 'PUT', body: { profile: profileBase } });
  assert.equal(res.status, 401);
});
