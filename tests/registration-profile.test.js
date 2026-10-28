// تست پروفایل ثبت‌نام: اعتبارسنجی سرور، ذخیرهٔ پایدار، شماره‌های تکراری، دسترسی به پروفایل، قیدهای مهاجرت ۰۰۰۸ و تطابق فهرست‌های سایت با Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import * as serverProfile from '../worker/src/auth/profile.js';
import * as siteOptions from '../site/js/registration-options.js';

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
  for (const f of ['0001_init.sql', '0002_auth.sql', '0008_registration_profile.sql']) db.exec(migration(f));
  const sent = [];
  const env = {
    DB: d1Like(db),
    PUBLIC_BASE_URL: 'https://wefagh.ir',
    mailer: async (msg) => { sent.push(msg); },
  };
  return { db, env, sent };
}

async function call(env, path, { method = 'POST', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(`https://wefagh.ir${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  }), env);
}

const baseProfile = {
  phone: '09123456789',
  province: 'اصفهان',
  city: 'اصفهان',
  professionalStatus: 'law_student',
  barAssociation: '',
  licenseNumber: '',
  licenseYear: '',
  experienceBand: 'none',
  practiceAreas: ['family', 'civil'],
  learningGoal: 'general_knowledge',
  skillAreas: ['case_analysis'],
  skillLevel: 'intermediate',
  learningFormat: 'short_lessons',
  notes: '',
};
const user = (n, profile = {}) => ({
  email: `user${n}@example.com`,
  password: 'رمز-امن-۱۴۰۵',
  displayName: `کاربر ${n}`,
  profile: { ...baseProfile, phone: `0912000000${n}`, ...profile },
});

test('دانشجو ثبت‌نام می‌کند؛ پروفایل پایدار ذخیره و شماره به صورت ۰۹ نرمال می‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  const res = await call(env, '/api/auth/register', { body: user(1, { phone: '۰۹۱۲-۳۴۵-۶۷۸۹' }) });
  assert.equal(res.status, 202);
  const row = db.prepare('SELECT phone, province, professional_status, practice_areas, skill_areas, bar_association, license_number FROM user_profiles').get();
  assert.equal(row.phone, '09123456789');
  assert.equal(row.province, 'اصفهان');
  assert.equal(row.professional_status, 'law_student');
  assert.deepEqual(JSON.parse(row.practice_areas).sort(), ['civil', 'family']);
  assert.equal(row.bar_association, null, 'دانشجو نباید اطلاعات پروانه ذخیره کند');
  assert.equal(row.license_number, null);
  assert.equal(sent.length, 1);
});

test('وکیل پایه یک بدون نام کانون رد می‌شود و شماره پروانهٔ غیرمجاز ثبت نمی‌شود', { skip }, async () => {
  const { db, env } = setup();
  const bad = await call(env, '/api/auth/register', { body: user(2, { professionalStatus: 'lawyer_p1', barAssociation: '' }) });
  assert.equal(bad.status, 422);
  assert.ok((await bad.json()).errors.barAssociation);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0, 'کاربر ناقص نباید ساخته شود');

  const ok = await call(env, '/api/auth/register', { body: user(3, { professionalStatus: 'lawyer_p1', barAssociation: 'کانون وکلای اصفهان', licenseNumber: 'ق-۱۲۳۴', licenseYear: '۱۴۰۲' }) });
  assert.equal(ok.status, 202);
  const row = db.prepare('SELECT license_number, license_year FROM user_profiles').get();
  assert.equal(row.license_number, 'ق-1234');
  assert.equal(row.license_year, 1402);
});

test('شماره، استان، وضعیت و فهرست‌های نامعتبر با خطای فیلدی رد می‌شوند', { skip }, async () => {
  const { db, env } = setup();
  const res = await call(env, '/api/auth/register', { body: user(4, { phone: '0812', province: 'نامعتبر', professionalStatus: 'hacker', practiceAreas: ['civil', 'bogus'], skillAreas: [] }) });
  assert.equal(res.status, 422);
  const { errors } = await res.json();
  for (const k of ['phone', 'province', 'professionalStatus', 'practiceAreas', 'skillAreas']) assert.ok(errors[k], `خطای ${k} انتظار می‌رفت`);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

test('شماره تکراری پاسخ عمومی می‌گیرد و کاربر دوم ساخته نمی‌شود', { skip }, async () => {
  const { db, env, sent } = setup();
  await call(env, '/api/auth/register', { body: user(5, { phone: '09121112233' }) });
  const dup = await call(env, '/api/auth/register', { body: user(6, { phone: '09121112233' }) });
  assert.equal(dup.status, 202);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_profiles').get().n, 1);
  assert.equal(sent.length, 1);
});

test('/api/me پروفایل کاربر وارد شده را برمی‌گرداند و بدون ورود پروفایلی نشت نمی‌کند', { skip }, async () => {
  const { db, env, sent } = setup();
  const u = user(7, { phone: '09129998877' });
  await call(env, '/api/auth/register', { body: u });
  const token = sent.at(-1).text.match(/token=([A-Za-z0-9_-]+)/)[1];
  await call(env, '/api/auth/verify-email', { body: { token } });
  const login = await call(env, '/api/auth/login', { body: { email: u.email, password: u.password } });
  const cookie = (login.headers.get('set-cookie') || '').match(/wefagh_session=[^;]+/)[0];
  const me = await (await call(env, '/api/me', { method: 'GET', cookie })).json();
  assert.equal(me.user.profile.phone, '09129998877');
  assert.deepEqual(me.user.profile.practiceAreas.sort(), ['civil', 'family']);
  assert.ok(!JSON.stringify(me).includes('password'));
  const anon = await call(env, '/api/me', { method: 'GET' });
  assert.equal(anon.status, 401);
  void db;
});

test('قیدهای مهاجرت ۰۰۰۸ ورودی بد را حتی بدون Worker رد می‌کنند', { skip }, () => {
  const { db, env } = setup();
  void env;
  db.prepare("INSERT INTO users (email, password_hash, display_name) VALUES ('a@b.cc', 'x', 'علی')").run();
  const uid = db.prepare('SELECT id FROM users').get().id;
  const base = { phone: '09120000001', province: 'تهران', city: 'تهران', status: 'law_student', exp: 'none', areas: '[]', goal: 'research', skills: '[]', level: 'beginner', fmt: 'interactive' };
  const insert = (over = {}) => {
    const v = { ...base, ...over };
    db.prepare(`INSERT INTO user_profiles (user_id, phone, province, city, professional_status, experience_band, practice_areas, learning_goal, skill_areas, skill_level, learning_format)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(uid, v.phone, v.province, v.city, v.status, v.exp, v.areas, v.goal, v.skills, v.level, v.fmt);
  };
  assert.throws(() => insert({ status: 'hacker' }));
  assert.throws(() => insert({ phone: '0812' }));
  assert.throws(() => insert({ areas: 'not-json' }));
  assert.throws(() => insert({ level: 'expert' }));
  insert();
  assert.throws(() => insert(), 'شماره تکراری باید رد شود');
});

test('فهرست‌های سمت سرور و سایت یکی هستند', () => {
  const pairs = [
    ['PROVINCES', serverProfile.PROVINCES, siteOptions.PROVINCES],
    ['PROFESSIONAL_STATUSES', serverProfile.PROFESSIONAL_STATUSES, Object.keys(siteOptions.PROFESSIONAL_STATUS)],
    ['LICENSED_STATUSES', serverProfile.LICENSED_STATUSES, siteOptions.LICENSED_STATUSES],
    ['EXPERIENCE_BANDS', serverProfile.EXPERIENCE_BANDS, Object.keys(siteOptions.EXPERIENCE_BANDS)],
    ['PRACTICE_AREAS', serverProfile.PRACTICE_AREAS, Object.keys(siteOptions.PRACTICE_AREAS)],
    ['LEARNING_GOALS', serverProfile.LEARNING_GOALS, Object.keys(siteOptions.LEARNING_GOALS)],
    ['SKILL_AREAS', serverProfile.SKILL_AREAS, Object.keys(siteOptions.SKILL_AREAS)],
    ['SKILL_LEVELS', serverProfile.SKILL_LEVELS, Object.keys(siteOptions.SKILL_LEVELS)],
    ['LEARNING_FORMATS', serverProfile.LEARNING_FORMATS, Object.keys(siteOptions.LEARNING_FORMATS)],
  ];
  for (const [name, server, site] of pairs) {
    assert.deepEqual([...site].sort(), [...server].sort(), `فهرست ${name} باید در سرور و سایت یکی باشد`);
  }
});

test('نرمال‌سازی شماره در سرور و سایت یکسان است', () => {
  for (const v of ['۰۹۱۲۳۴۵۶۷۸۹', '0912 345 6789', '0912-345-6789', '+989123456789', '0812']) {
    assert.equal(serverProfile.normalizePhone(v), siteOptions.normalizePhone(v), v);
  }
});
