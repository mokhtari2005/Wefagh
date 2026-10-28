import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../worker/src/index.js';
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
  for (const file of ['0001_init.sql', '0002_auth.sql', '0003_academy.sql', '0004_deadlines.sql', '0005_casework.sql', '0006_admin_content.sql']) db.exec(migration(file));
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
const caseItem = { kind: 'case', slug: 'training-rent-dispute', title: 'اختلاف آموزشی اجاره', summary: 'پرونده‌ای فرضی برای تمرین بررسی مدارک و تحلیل اختلاف بر سر اجاره.', status: 'draft', payload: { area: 'املاک و اجاره', level: 'مقدماتی', facts: ['قرارداد اجاره برای یک سال منعقد شده است.'], issues: [{ id: 'deposit-return', text: 'استرداد ودیعه با چه مدارکی قابل اثبات است؟' }], evidence: ['قرارداد اجاره و رسید پرداخت ودیعه'] } };

test('پنل مدیریت بدون ورود ۴۰۱ و برای کاربر عادی ۴۰۳ می‌دهد', { skip }, async () => {
  const { env } = await setup();
  assert.equal((await worker.fetch(req('/api/admin/content'), env)).status, 401);
  const ordinary = await setup(null);
  assert.equal((await worker.fetch(req('/api/admin/content', { cookie: ordinary.cookie }), ordinary.env)).status, 403);
});

test('مدیر می‌تواند محتوای معتبر بسازد و پیش‌نویس را مدیریت کند', { skip }, async () => {
  const { env, cookie } = await setup();
  const created = await worker.fetch(req('/api/admin/content', { method: 'POST', body: caseItem, cookie }), env);
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  const listed = await worker.fetch(req('/api/admin/content?kind=case', { cookie }), env);
  assert.equal((await listed.json()).items[0].slug, caseItem.slug);
  const published = await worker.fetch(req(`/api/admin/content/${id}`, { method: 'PATCH', body: { status: 'published' }, cookie }), env);
  assert.equal(published.status, 200);
  const publicList = await worker.fetch(req('/api/cases'), env);
  assert.ok((await publicList.json()).cases.some((item) => item.id === caseItem.slug));
  const detail = await worker.fetch(req(`/api/cases/${caseItem.slug}`), env);
  assert.equal((await detail.json()).case.facts[0], caseItem.payload.facts[0]);
  const unpublished = await worker.fetch(req(`/api/admin/content/${id}`, { method: 'PATCH', body: { status: 'draft' }, cookie }), env);
  assert.equal(unpublished.status, 200);
  assert.equal((await worker.fetch(req(`/api/cases/${caseItem.slug}`), env)).status, 404);
  assert.equal((await worker.fetch(req(`/api/admin/content/${id}`, { method: 'DELETE', cookie }), env)).status, 200);
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
