import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../worker/src/index.js';
import batch01 from '../worker/src/moot/bank/batch-01.js';

// پروندهٔ نمونه از دستهٔ ۰۱ (پیش‌نویس با استنادهای نیازمند بررسی): برای آزمون گیت انتشار.
const batch01Case = batch01[0];
import { hashToken } from '../worker/src/auth/token.js';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
const skip = !DatabaseSync && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (name) => readFileSync(join(here, '..', 'worker', 'migrations', name), 'utf8');
function d1Like(db) {
  return { prepare(sql) {
    const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
    return {
      all: async (...args) => ({ results: stmt.all(...args) }),
      first: async (...args) => stmt.get(...args) ?? null,
      run: async (...args) => { stmt.run(...args); return { success: true }; },
      bind(...args) { return {
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => { stmt.run(...args); return { success: true }; },
      }; }
    };
  } };
}
async function setup(role = 'super_admin') {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON;');
  for (const file of ['0001_init.sql', '0002_auth.sql', '0003_academy.sql', '0004_deadlines.sql', '0005_casework.sql', '0006_admin_content.sql', '0009_moot_case_bank.sql']) db.exec(migration(file));
  const user = db.prepare("INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('admin@example.com','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  if (role) db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(user.id, role);
  const token = `admin-session-token-${role || 'none'}-123456`;
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: d1Like(db) }, cookie: `wefagh_session=${token}`, userId: user.id };
}
function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {}; if (body !== undefined) headers['content-type'] = 'application/json'; if (cookie) headers.cookie = cookie;
  return new Request(`https://wefagh.ir${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const course = { kind: 'course', slug: 'contract-writing-basics', title: 'مبانی تنظیم قرارداد', summary: 'دوره‌ای برای تمرین اصول پایهٔ تنظیم و بررسی قراردادهای روزمره.', status: 'published', payload: { level: 'مقدماتی', lessons: [{ id: 'intro', title: 'شناخت ساختار قرارداد', body: 'در این درس اجزای اصلی قرارداد و اهمیت تعریف دقیق تعهدات را بررسی می‌کنیم.' }] } };
const caseItem = { kind: 'case', slug: batch01Case.id, title: batch01Case.title, summary: batch01Case.subject.padEnd(12, '.').slice(0, 300), status: 'draft', payload: batch01Case };

test('پنل مدیریت بدون ورود ۴۰۱ و برای کاربر عادی ۴۰۳ می‌دهد', { skip }, async () => {
  const { env } = await setup();
  assert.equal((await worker.fetch(req('/api/admin/content'), env)).status, 401);
  const ordinary = await setup(null);
  assert.equal((await worker.fetch(req('/api/admin/content', { cookie: ordinary.cookie }), ordinary.env)).status, 403);
});

test('مدیر پیش‌نویس معتبر می‌سازد؛ انتشار با استنادهای بررسی‌نشده رد می‌شود و پس از اصلاح منتشر می‌شود', { skip }, async () => {
  const { env, cookie, db } = await setup();
  const created = await worker.fetch(req('/api/admin/content', { method: 'POST', body: caseItem, cookie }), env);
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  const listed = await worker.fetch(req('/api/admin/content?kind=case', { cookie }), env);
  assert.equal((await listed.json()).items[0].slug, caseItem.slug);

  // گیت انتشار: استنادهای needs_review نباید منتشر شوند.
  const blocked = await worker.fetch(req(`/api/admin/content/${id}`, { method: 'PATCH', body: { status: 'published' }, cookie }), env);
  assert.equal(blocked.status, 422);
  assert.ok((await blocked.json()).errors.case.some((e) => e.includes('بررسی‌نشده')));
  assert.equal((await worker.fetch(req(`/api/cases/${caseItem.slug}`), env)).status, 404);
  const logBefore = db.prepare("SELECT COUNT(*) AS n FROM moot_case_reviews WHERE case_slug = ?").get(caseItem.slug).n;
  assert.equal(logBefore, 0);

  // «اصلاح‌شده» بدون شماره ماده و منبع پذیرفته نمی‌شود؛ شماره ماده در این آزمون ساخته نمی‌شود.
  const reviewed = structuredClone(caseItem.payload);
  reviewed.legal_refs = reviewed.legal_refs.map((r) => ({ ...r, status: 'corrected', note: 'یادداشت بررسی' }));
  const invalidFix = await worker.fetch(req(`/api/admin/content/${id}`, { method: 'PATCH', body: { payload: reviewed, status: 'published' }, cookie }), env);
  assert.equal(invalidFix.status, 422);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM moot_case_reviews WHERE case_slug = ? AND action = 'approve'").get(caseItem.slug).n, 0);
  assert.equal((await worker.fetch(req(`/api/cases/${caseItem.slug}`), env)).status, 404);
  assert.equal((await worker.fetch(req(`/api/admin/content/${id}`, { method: 'DELETE', cookie }), env)).status, 200);
});

test('ثبت انتشار در گردش بررسی: انتشار و بازگشت به پیش‌نویس', { skip }, async () => {
  const { env, cookie, db } = await setup();
  const published = { ...caseItem, status: 'published' };
  const res = await worker.fetch(req('/api/admin/content', { method: 'POST', body: published, cookie }), env);
  assert.equal(res.status, 422, 'پروندهٔ با استناد بررسی‌نشده مستقیماً منتشر نمی‌شود');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM moot_case_reviews').get().n, 0);
});


test('شناسهٔ پروندهٔ داخلی باید با slug یکسان باشد', { skip }, async () => {
  const { env, cookie } = await setup();
  const mismatched = { ...caseItem, slug: 'other-slug-001' };
  const res = await worker.fetch(req('/api/admin/content', { method: 'POST', body: mismatched, cookie }), env);
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.id);
});

test('دورهٔ منتشرشده به فهرست عمومی و جزئیات آکادمی وارد می‌شود', { skip }, async () => {
  const { env, cookie, userId, db } = await setup();
  const created = await worker.fetch(req('/api/admin/content', { method: 'POST', body: course, cookie }), env);
  assert.equal(created.status, 201);
  const list = await worker.fetch(req('/api/academy/courses'), env);
  assert.ok((await list.json()).courses.some((item) => item.id === course.slug));
  const detail = await worker.fetch(req(`/api/academy/courses/${course.slug}`), env);
  assert.equal((await detail.json()).course.lessons[0].id, 'intro');
  const enrolled = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: course.slug }, cookie }), env);
  assert.equal(enrolled.status, 200);
  const complete = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: course.slug, lessonId: 'intro' }, cookie }), env);
  assert.equal(complete.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ?').get(userId).n, 1);
});

test('اعتبارسنجی سمت سرور محتوای ناقص را رد می‌کند و انتشار پیش‌نویس بدون payload معتبر ممکن نیست', { skip }, async () => {
  const { env, cookie } = await setup();
  const invalid = await worker.fetch(req('/api/admin/content', { method: 'POST', body: { ...course, payload: { level: 'x', lessons: [] } }, cookie }), env);
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error, 'VALIDATION_FAILED');
});
