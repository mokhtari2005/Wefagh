import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { COURSES } from '../worker/src/academy/catalog.js';

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
              stmt.run(...args);
              return { success: true, results: [] };
            },
          };
        },
      };
    },
  };
}

async function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0003_academy.sql'));
  const env = { DB: d1Like(db) };
  // کاربر تأییدشده و نشست معتبر را مستقیم می‌سازیم (بدون وابستگی به ایمیل).
  const u = db
    .prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('s@example.com','h','دانشجو', '2026-01-01T00:00:00Z') RETURNING id")
    .get();
  const token = 'test-session-token-123456789';
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(
    await hashToken(token),
    u.id,
    '2099-01-01T00:00:00.000Z'
  );
  return { db, env, cookie: `wefagh_session=${token}` };
}

function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new Request(`https://wefagh.ir${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test('فهرست دوره‌ها بدون ورود قابل دیدن است و متن درس‌ها را ندارد', async () => {
  const res = await worker.fetch(req('/api/academy/courses'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.courses.length, COURSES.length);
  assert.ok(body.courses.every((c) => c.lessonCount >= 1 && !('lessons' in c)));
});

test('جزئیات دوره با درس‌ها برگردانده می‌شود و دوره ناشناخته ۴۰۴ می‌دهد', async () => {
  const ok = await worker.fetch(req('/api/academy/courses/civil-basics'), {});
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.ok(body.course.lessons.length >= 1);
  assert.ok(body.course.lessons[0].body.length > 20);
  const missing = await worker.fetch(req('/api/academy/courses/nope'), {});
  assert.equal(missing.status, 404);
});

test('ثبت‌نام و تکمیل درس بدون ورود ۴۰۱ می‌دهد', { skip }, async () => {
  const { env } = await setup();
  const res = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-basics' } }), env);
  assert.equal(res.status, 401);
});

test('ثبت‌نام، تکمیل درس و خواندن پیشرفت برای کاربر واردشده', { skip }, async () => {
  const { env, cookie } = await setup();
  const enr = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-basics' }, cookie }), env);
  assert.equal(enr.status, 200);
  // تکرار ثبت‌نام خطا نمی‌دهد (idempotent)
  const again = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-basics' }, cookie }), env);
  assert.equal(again.status, 200);

  const done = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: 'civil-basics', lessonId: 'l1' }, cookie }), env);
  assert.equal(done.status, 200);
  const done2 = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: 'civil-basics', lessonId: 'l1' }, cookie }), env);
  assert.equal(done2.status, 200);

  const prog = await worker.fetch(req('/api/academy/progress?courseId=civil-basics', { cookie }), env);
  const p = await prog.json();
  assert.equal(p.enrolled, true);
  assert.deepEqual(p.completedLessonIds, ['l1']);
  assert.equal(p.total, COURSES[0].lessons.length);
});

test('تکمیل درس بدون ثبت‌نام در دوره با ۴۰۳ رد می‌شود', { skip }, async () => {
  const { env, cookie } = await setup();
  const res = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: 'civil-basics', lessonId: 'l1' }, cookie }), env);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'NOT_ENROLLED');
});

test('شناسه دوره یا درس نامعتبر یا تزریق‌شده رد می‌شود', { skip }, async () => {
  const { env, cookie } = await setup();
  const bad = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: "x'; DROP TABLE users;--" }, cookie }), env);
  assert.equal(bad.status, 422);
  const badLesson = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: 'civil-basics', lessonId: 'zzz' }, cookie }), env);
  assert.equal(badLesson.status, 422);
});

test('هر کاربر فقط پیشرفت خودش را می‌بیند', { skip }, async () => {
  const { db, env, cookie } = await setup();
  await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-basics' }, cookie }), env);
  await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: 'civil-basics', lessonId: 'l2' }, cookie }), env);
  const other = db
    .prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('o@example.com','h','دیگری','2026-01-01T00:00:00Z') RETURNING id")
    .get();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken('other-token-abcdefghijk'), other.id, '2099-01-01T00:00:00.000Z');
  const res = await worker.fetch(req('/api/academy/progress?courseId=civil-basics', { cookie: 'wefagh_session=other-token-abcdefghijk' }), env);
  const p = await res.json();
  assert.equal(p.enrolled, false);
  assert.deepEqual(p.completedLessonIds, []);
});

test('فهرست دوره‌ها وضعیت ثبت‌نام کاربر واردشده را نشان می‌دهد و مهمان همه را false می‌بیند', { skip }, async () => {
  const { db, env, cookie } = await setup();
  const guest = await (await worker.fetch(req('/api/academy/courses'), env)).json();
  assert.ok(guest.courses.every((c) => c.enrolled === false));

  const first = guest.courses[0].id;
  await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: first }, cookie }), env);
  const list = await (await worker.fetch(req('/api/academy/courses', { cookie }), env)).json();
  const mine = list.courses.find((c) => c.id === first);
  assert.equal(mine.enrolled, true);
  assert.equal(list.courses.filter((c) => c.enrolled).length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n, 1);
});
