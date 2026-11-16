import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { COURSES } from '../worker/src/academy/catalog.js';
import { lessonLearning } from '../worker/src/academy/learning.js';

let DatabaseSync;
let sqliteAvailable = true;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  sqliteAvailable = false;
}
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const PUB = 'pub-course';
const migration = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');

function d1Like(db) {
  // شبیه D1: هم prepare(sql).all() بدون پارامتر و هم prepare(sql).bind(...).first()/all()/run() را پشتیبانی می‌کند.
  return {
    prepare(sql) {
      const compiled = sql.replace(/\?\d+/g, '?');
      const run = (args) => ({
        first: async () => db.prepare(compiled).get(...args) ?? null,
        all: async () => ({ success: true, results: db.prepare(compiled).all(...args) }),
        run: async () => {
          db.prepare(compiled).run(...args);
          return { success: true, results: [] };
        },
      });
      return { ...run([]), bind: (...args) => run(args) };
    },
  };
}

async function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0003_academy.sql'));
  db.exec(migration('0006_admin_content.sql'));
  db.exec(migration('0013_academy_assessments.sql'));
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
  // یک دورهٔ منتشرشده از پنل مدیریت برای آزمون ثبت‌نام و پیشرفت (دوره‌های داخلی پیش‌نویس‌اند).
  db.prepare(`INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by)
    VALUES ('course', ?1, ?2, ?3, 'published', ?4, ?5)`).run(
    PUB,
    'دورهٔ منتشرشدهٔ آزمایشی',
    'خلاصهٔ آزمایشی برای بررسی ثبت‌نام و پیشرفت کاربر',
    JSON.stringify({
      level: 'مقدماتی',
      lessons: [
        { id: 'l1', title: 'درس اول', body: 'متن آزمایشی درس اول برای بررسی تکمیل درس در آزمون.' },
        { id: 'l2', title: 'درس دوم', body: 'متن آزمایشی درس دوم برای بررسی تکمیل درس در آزمون.' },
      ],
    }),
    u.id,
  );
  return { db, env, cookie: `wefagh_session=${token}` };
}

function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new Request(`https://mokhtari.ir${path}`, {
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

test('دوره پیش‌نویس داخلی برای مهمان محتوا ندارد؛ ناشناخته ۴۰۴ می‌دهد', async () => {
  const draft = await worker.fetch(req('/api/academy/courses/civil-basics'), {});
  assert.equal(draft.status, 403);
  assert.equal((await draft.json()).error, 'COURSE_NOT_PUBLISHED');
  const missing = await worker.fetch(req('/api/academy/courses/nope'), {});
  assert.equal(missing.status, 404);
});

test('ثبت‌نام و تکمیل درس بدون ورود ۴۰۱ می‌دهد', { skip }, async () => {
  const { env } = await setup();
  const res = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-basics' } }), env);
  assert.equal(res.status, 401);
});

test('ثبت‌نام کاربر عادی در دوره پیش‌نویس داخلی ممنوع است', { skip }, async () => {
  const { env, cookie } = await setup();
  const res = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-basics' }, cookie }), env);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'COURSE_NOT_PUBLISHED');
});

test('ثبت‌نام، تکمیل درس و خواندن پیشرفت برای کاربر واردشده در دورهٔ منتشرشده', { skip }, async () => {
  const { env, cookie } = await setup();
  const enr = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: PUB }, cookie }), env);
  assert.equal(enr.status, 200);
  // تکرار ثبت‌نام خطا نمی‌دهد (idempotent)
  const again = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: PUB }, cookie }), env);
  assert.equal(again.status, 200);

  const done = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: PUB, lessonId: 'l1' }, cookie }), env);
  assert.equal(done.status, 200);
  const done2 = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: PUB, lessonId: 'l1' }, cookie }), env);
  assert.equal(done2.status, 200);

  const prog = await worker.fetch(req(`/api/academy/progress?courseId=${PUB}`, { cookie }), env);
  const p = await prog.json();
  assert.equal(p.enrolled, true);
  assert.deepEqual(p.completedLessonIds, ['l1']);
  assert.equal(p.total, 2);
});

test('تکمیل درس بدون ثبت‌نام در دوره با ۴۰۳ رد می‌شود', { skip }, async () => {
  const { env, cookie } = await setup();
  const res = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: PUB, lessonId: 'l1' }, cookie }), env);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'NOT_ENROLLED');
});

test('شناسه دوره یا درس نامعتبر یا تزریق‌شده رد می‌شود', { skip }, async () => {
  const { env, cookie } = await setup();
  const bad = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: "x'; DROP TABLE users;--" }, cookie }), env);
  assert.equal(bad.status, 422);
  const badLesson = await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: PUB, lessonId: 'zzz' }, cookie }), env);
  assert.equal(badLesson.status, 422);
});

test('هر کاربر فقط پیشرفت خودش را می‌بیند', { skip }, async () => {
  const { db, env, cookie } = await setup();
  await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: PUB }, cookie }), env);
  await worker.fetch(req('/api/academy/complete', { method: 'POST', body: { courseId: PUB, lessonId: 'l2' }, cookie }), env);
  const other = db
    .prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('o@example.com','h','دیگری','2026-01-01T00:00:00Z') RETURNING id")
    .get();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken('other-token-abcdefghijk'), other.id, '2099-01-01T00:00:00.000Z');
  const res = await worker.fetch(req(`/api/academy/progress?courseId=${PUB}`, { cookie: 'wefagh_session=other-token-abcdefghijk' }), env);
  const p = await res.json();
  assert.equal(p.enrolled, false);
  assert.deepEqual(p.completedLessonIds, []);
});

test('فهرست دوره‌ها وضعیت ثبت‌نام کاربر واردشده را نشان می‌دهد و مهمان همه را false می‌بیند', { skip }, async () => {
  const { db, env, cookie } = await setup();
  const guest = await (await worker.fetch(req('/api/academy/courses'), env)).json();
  assert.ok(guest.courses.every((c) => c.enrolled === false));
  assert.ok(guest.courses.some((c) => c.id === PUB && c.enrollable === true));
  assert.ok(guest.courses.filter((c) => c.status === 'draft').every((c) => c.enrollable === false));

  await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: PUB }, cookie }), env);
  const list = await (await worker.fetch(req('/api/academy/courses', { cookie }), env)).json();
  const mine = list.courses.find((c) => c.id === PUB);
  assert.equal(mine.enrolled, true);
  assert.equal(list.courses.filter((c) => c.enrolled).length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n, 1);
});


test('تمرین تشریحی و آزمونک دوره در سرور ارزیابی و در کارنامه ذخیره می‌شود', { skip }, async () => {
  const { db, env, cookie } = await setup();
  const enrolled = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-litigation-practice' }, cookie }), env);
  assert.equal(enrolled.status, 200);

  const detail = await worker.fetch(req('/api/academy/courses/civil-litigation-practice'), env);
  const course = await detail.json();
  assert.equal(course.course.lessons[0].learning.quiz.options.length, 4);
  assert.ok(course.course.lessons[0].learning.assignment);

  const failed = await worker.fetch(req('/api/academy/assess', {
    method: 'POST',
    cookie,
    body: { courseId: 'civil-litigation-practice', lessonId: 'l1', answerIndex: 0, responseText: 'تحلیل تمرینی کافی برای ثبت و ارزیابی پاسخ کارآموز.' },
  }), env);
  assert.equal(failed.status, 200);
  assert.equal((await failed.json()).passed, false);

  const passed = await worker.fetch(req('/api/academy/assess', {
    method: 'POST',
    cookie,
    body: { courseId: 'civil-litigation-practice', lessonId: 'l1', answerIndex: 1, responseText: 'در این پرونده باید خواسته، سبب، طرفین، مرجع صالح و ادله اصلی را جداگانه مشخص و ابهام‌ها را ثبت کرد.' },
  }), env);
  const result = await passed.json();
  assert.equal(passed.status, 200);
  assert.equal(result.passed, true);
  assert.equal(result.score, 100);

  const progress = await worker.fetch(req('/api/academy/progress?courseId=civil-litigation-practice', { cookie }), env);
  const state = await progress.json();
  assert.deepEqual(state.completedLessonIds, ['l1']);
  assert.equal(state.assessments[0].passed, true);
  assert.equal(state.assessments[0].answerIndex, 1);
  assert.equal(state.assessments[0].responseText.startsWith('در این پرونده'), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lesson_assessments').get().n, 1);
});

test('ارسال تمرین بدون ثبت‌نام یا با پاسخ کوتاه پذیرفته نمی‌شود', { skip }, async () => {
  const { env, cookie } = await setup();
  const notEnrolled = await worker.fetch(req('/api/academy/assess', {
    method: 'POST', cookie,
    body: { courseId: 'civil-litigation-practice', lessonId: 'l1', answerIndex: 1, responseText: 'پاسخ تشریحی کامل و قابل ارزیابی برای تمرین آموزشی.' },
  }), env);
  assert.equal(notEnrolled.status, 403);
  const enrolled = await worker.fetch(req('/api/academy/enroll', { method: 'POST', body: { courseId: 'civil-litigation-practice' }, cookie }), env);
  assert.equal(enrolled.status, 200);
  const short = await worker.fetch(req('/api/academy/assess', {
    method: 'POST', cookie,
    body: { courseId: 'civil-litigation-practice', lessonId: 'l1', answerIndex: 1, responseText: 'کوتاه' },
  }), env);
  assert.equal(short.status, 422);
});


test('کاتالوگ شامل ۱۰۰ دوره است و همه درس‌ها تمرین و آزمونک دارند', () => {
  assert.equal(COURSES.length, 100);
  const courseIds = [...COURSES.filter((course) => course.status === 'published').map((course) => course.id), 'advocacy-writing', 'civil-basics'];
  let total = 0;
  for (const courseId of courseIds) {
    const lessonCount = courseId === 'advocacy-writing' || courseId === 'civil-basics' ? 3 : 5;
    for (let i = 1; i <= lessonCount; i++) {
      const activity = lessonLearning(courseId, `l${i}`);
      assert.ok(activity, `فعالیت درس ${courseId}/l${i} تعریف نشده است`);
      assert.equal(activity.quiz.options.length, 4);
      assert.ok(activity.assignment.length >= 30);
      total++;
    }
  }
  assert.equal(total, 496);
});

test('نسخه منتشرشده پنل مدیریت بر نسخه پیش‌نویس داخلی همان دوره اولویت دارد', { skip }, async () => {
  const { db, env } = await setup();
  db.prepare(`INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by)
    VALUES ('course', 'civil-basics', 'مبانی دادرسی مدنی منتشرشده', 'نسخه مدیریت‌شده', 'published', ?1, 1)`).run(JSON.stringify({
      level: 'مقدماتی',
      lessons: [{ id: 'l1', title: 'درس مدیریت‌شده', body: 'محتوای منتشرشده از پنل مدیریت برای آزمون اولویت نسخه.' }],
    }));
  const response = await worker.fetch(req('/api/academy/courses/civil-basics'), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.course.title, 'مبانی دادرسی مدنی منتشرشده');
  assert.equal(data.course.lessons[0].title, 'درس مدیریت‌شده');
});


test('مرکز آزمون برای کاربر واردشده حوزه‌های اصلی را نمایش می‌دهد و کلید پاسخ را افشا نمی‌کند', { skip }, async () => {
  const { env, cookie } = await setup();
  const list = await worker.fetch(req('/api/academy/exams', { cookie }), env);
  assert.equal(list.status, 200);
  const data = await list.json();
  assert.ok(data.subjects.length >= 9);
  assert.ok(data.subjects.some((s) => s.id === 'civil'));
  const start = await worker.fetch(req('/api/academy/exams/start', { method: 'POST', cookie, body: { subjectId: 'civil' } }), env);
  assert.equal(start.status, 201);
  const attempt = (await start.json()).attempt;
  assert.equal(attempt.questions.length, 2);
  assert.ok(attempt.questions.every((q) => !('correctIndex' in q) && !('a' in q)));
  assert.ok(attempt.essay.prompt.length > 50);
});

test('مرکز آزمون بدون ورود در دسترس نیست', async () => {
  const response = await worker.fetch(req('/api/academy/exams'), { DB: { prepare(){ throw new Error('DB should not be reached'); } } });
  assert.equal(response.status, 401);
});
