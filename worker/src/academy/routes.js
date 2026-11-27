// مسیرهای آکادمی: فهرست و متن دوره‌ها (عمومی) و ثبت‌نام/پیشرفت (نیازمند ورود).
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { COURSES, courseSummaries, findCourse, findLesson, isPublicCourse } from './catalog.js';
import { lessonLearning } from './learning.js';
import { handleAcademyExams } from './exam-routes.js';
import { generateLessonLegalReview, gradeLessonResponse } from './legal-review.js';

const MANAGER_ROLES = ['admin', 'super_admin', 'academy_manager'];
const isManager = (user) => Boolean(user && Array.isArray(user.roles) && user.roles.some((r) => MANAGER_ROLES.includes(r)));

/** دوره‌های منتشرشده برای همه؛ پیش‌نویس‌ها فقط برای مدیر آکادمی. */
async function canAccessCourse(request, env, course) {
  if (isPublicCourse(course)) return true;
  return isManager(await currentUser(request, env));
}

const ID_RE = /^[a-z0-9-]{1,64}$/;
const assessmentSchemaPromises = new WeakMap();
const legalReviewSchemaPromises = new WeakMap();

async function ensureLegalReviewSchema(db) {
  let ready = legalReviewSchemaPromises.get(db);
  if (!ready) {
    ready = db.prepare('CREATE TABLE IF NOT EXISTS lesson_legal_reviews (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, review_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')), PRIMARY KEY (user_id, course_id, lesson_id))').run().catch((error) => { legalReviewSchemaPromises.delete(db); throw error; });
    legalReviewSchemaPromises.set(db, ready);
  }
  await ready;
}

async function ensureAssessmentSchema(db) {
  let ready = assessmentSchemaPromises.get(db);
  if (!ready) {
    ready = db.prepare(`CREATE TABLE IF NOT EXISTS lesson_assessments (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL CHECK (length(course_id) BETWEEN 1 AND 64),
      lesson_id TEXT NOT NULL CHECK (length(lesson_id) BETWEEN 1 AND 64),
      answer_index INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 10),
      response_text TEXT NOT NULL CHECK (length(response_text) BETWEEN 30 AND 12000),
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
      submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (user_id, course_id, lesson_id)
    )`).run().catch((error) => {
      assessmentSchemaPromises.delete(db);
      throw error;
    });
    assessmentSchemaPromises.set(db, ready);
  }
  await ready;
}

async function publishedCourses(env) {
  if (!env.DB) return [];
  let rows;
  try {
    rows = await env.DB.prepare("SELECT slug, title, summary, payload_json FROM admin_content WHERE kind = 'course' AND status = 'published' ORDER BY title LIMIT 200").all();
  } catch (error) {
    console.error('managed course content unavailable', String(error?.message || error).slice(0, 120));
    return [];
  }
  return (rows?.results || []).flatMap((row) => {
    try { const payload = JSON.parse(row.payload_json); return [{ id: row.slug, title: row.title, summary: row.summary, level: payload.level, format: payload.format === 'workshop' ? 'workshop' : 'course', lessons: payload.lessons, status: 'published' }]; } catch { return []; }
  });
}

async function getCourse(env, id) {
  if (env.DB) {
    let row;
    try {
      row = await env.DB.prepare("SELECT slug, title, summary, payload_json FROM admin_content WHERE kind = 'course' AND status = 'published' AND slug = ?1").bind(id).first();
    } catch (error) {
      console.error('managed course content unavailable', String(error?.message || error).slice(0, 120));
    }
    if (row) {
      try {
        const payload = JSON.parse(row.payload_json);
        return { id: row.slug, title: row.title, summary: row.summary, level: payload.level, format: payload.format === 'workshop' ? 'workshop' : 'course', lessons: payload.lessons, status: 'published' };
      } catch {
        return null;
      }
    }
  }
  return findCourse(id);
}

async function requireUser(request, env) {
  return currentUser(request, env);
}

/** شناسهٔ دوره‌های کاربر واردشده؛ مهمان یا نبود جدول، مجموعهٔ خالی برمی‌گرداند. */
async function enrolledCourseIds(request, env) {
  const empty = new Set();
  if (!env.DB) return empty;
  const user = await currentUser(request, env);
  if (!user) return empty;
  try {
    const rows = await env.DB.prepare('SELECT course_id FROM enrollments WHERE user_id = ?1').bind(user.id).all();
    return new Set((rows?.results || []).map((r) => r.course_id));
  } catch {
    return empty;
  }
}

export async function handleAcademy(request, env, path) {
  if (path.startsWith('/api/academy/exams')) return handleAcademyExams(request, env, path);
  if (path === '/api/academy/courses') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const managed = await publishedCourses(env);
    const summaries = managed.map((c) => ({ id: c.id, title: c.title, level: c.level, summary: c.summary, lessonCount: c.lessons.length, status: 'published' }));
    const managedIds = new Set(summaries.map((c) => c.id));
    const all = [...courseSummaries().filter((c) => !managedIds.has(c.id)), ...summaries];
    const enrolledIds = await enrolledCourseIds(request, env);
    return json({ ok: true, courses: all.map((c) => ({ ...c, enrolled: enrolledIds.has(c.id), enrollable: c.status === 'published' })) });
  }

  const detail = path.match(/^\/api\/academy\/courses\/([a-z0-9-]{1,64})$/);
  if (detail) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const course = await getCourse(env, detail[1]);
    if (!course) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
    return json({
      ok: true,
      course: {
        id: course.id, title: course.title, level: course.level, summary: course.summary, format: course.format || 'course',
        status: course.status || 'published',
        lessons: course.lessons.map((l) => {
          const learning = lessonLearning(course.id, l.id);
          return {
            id: l.id, title: l.title, body: l.body,
            learning: learning ? {
              assignment: learning.assignment,
              rubric: learning.rubric,
              quiz: { question: learning.quiz.question, options: learning.quiz.options },
            } : null,
          };
        }),
      },
    });
  }

  if (path === '/api/academy/enroll') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const courseId = parsed.body?.courseId;
    if (typeof courseId !== 'string' || !ID_RE.test(courseId) || !(await getCourse(env, courseId))) {
      return json({ ok: false, error: 'VALIDATION_FAILED', errors: { courseId: 'دوره نامعتبر است.' } }, 422);
    }
    const enrollTarget = await getCourse(env, courseId);
    if (!(await canAccessCourse(request, env, enrollTarget))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
    await env.DB.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?1, ?2)').bind(user.id, courseId).run();
    return json({ ok: true, enrolled: true });
  }

  if (path === '/api/academy/assess') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const { courseId, lessonId, answerIndex, responseText } = parsed.body || {};
    const course = typeof courseId === 'string' && ID_RE.test(courseId) ? await getCourse(env, courseId) : null;
    const lesson = course && typeof lessonId === 'string' && ID_RE.test(lessonId) ? findLesson(course, lessonId) : null;
    const learning = lesson && lessonLearning(course.id, lesson.id);
    if (!course || !lesson || !learning || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= learning.quiz.options.length || typeof responseText !== 'string' || responseText.trim().length < 30 || responseText.length > 12000) {
      return json({ ok: false, error: 'VALIDATION_FAILED', message: 'پاسخ تمرین باید دست‌کم ۳۰ نویسه داشته باشد و یک گزینه از آزمونک انتخاب شود.' }, 422);
    }
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
    const enrolled = await env.DB.prepare('SELECT 1 AS x FROM enrollments WHERE user_id = ?1 AND course_id = ?2').bind(user.id, course.id).first();
    if (!enrolled) return json({ ok: false, error: 'NOT_ENROLLED' }, 403);
    let essayAssessment;
    try {
      essayAssessment = await gradeLessonResponse(env, course, lesson, { ...learning, _answerIndex: answerIndex }, responseText);
    } catch (error) {
      console.error('academy essay grading unavailable', String(error?.code || error?.name || 'Error').slice(0, 80));
      return json({ ok: false, error: 'ESSAY_GRADING_UNAVAILABLE', gradingPending: true, message: 'پاسخ شما هنوز نمره‌دهی نشده است؛ سرویس تصحیح در دسترس نیست. لطفاً بعداً دوباره تلاش کنید.' }, 503);
    }
    const objectiveCorrect = answerIndex === learning.quiz.correctIndex;
    const score = Math.round((objectiveCorrect ? 40 : 0) + essayAssessment.score * 0.6);
    const passed = objectiveCorrect && essayAssessment.score >= 60;
    try {
      await ensureAssessmentSchema(env.DB);
      await env.DB.prepare(`INSERT INTO lesson_assessments (user_id, course_id, lesson_id, answer_index, response_text, score, passed)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(user_id, course_id, lesson_id) DO UPDATE SET
        answer_index = excluded.answer_index, response_text = excluded.response_text,
        score = excluded.score, passed = excluded.passed,
        submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
        .bind(user.id, course.id, lesson.id, answerIndex, responseText.trim(), score, passed ? 1 : 0).run();
    } catch (error) {
      console.error('academy assessment storage unavailable', String(error?.message || error).slice(0, 120));
      return json({ ok: false, error: 'ASSESSMENTS_NOT_CONFIGURED', message: 'ذخیره ارزیابی هنوز روی سرور فعال نشده است.' }, 503);
    }
    if (passed) {
      await env.DB.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, course_id, lesson_id) VALUES (?1, ?2, ?3)').bind(user.id, course.id, lesson.id).run();
    }
    let legalReview = null;
    try {
      await ensureLegalReviewSchema(env.DB);
      legalReview = await generateLessonLegalReview(env, course, lesson, learning, answerIndex, responseText);
      legalReview = { ...(legalReview || {}), essayAssessment };
      await env.DB.prepare('INSERT INTO lesson_legal_reviews (user_id, course_id, lesson_id, review_json, updated_at) VALUES (?1, ?2, ?3, ?4, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')) ON CONFLICT(user_id, course_id, lesson_id) DO UPDATE SET review_json=excluded.review_json, updated_at=excluded.updated_at').bind(user.id, course.id, lesson.id, JSON.stringify(legalReview)).run();
    } catch (error) {
      legalReview = { essayAssessment };
      console.error('academy legal review unavailable', String(error?.code || error?.name || 'Error').slice(0, 80));
    }
    return json({ ok: true, score, essayScore: essayAssessment.score, passed, explanation: learning.quiz.explanation, legalReview, essayAssessment, legalReviewPending: !legalReview?.analysis, legalReviewNote: legalReview?.analysis ? null : 'تحلیل مستندات حقوقی تکمیلی فعلاً آماده نشد؛ نمره پاسخ تشریحی ثبت شده است.', message: passed ? 'آزمونک با موفقیت گذرانده شد و درس در کارنامه ثبت شد.' : 'پاسخ ثبت شد، اما برای قبولی باید هم گزینه تستی صحیح باشد و هم نمره پاسخ تشریحی دست‌کم ۶۰ از ۱۰۰ شود. بازخورد را بخوانید و دوباره تلاش کنید.' });
  }

  if (path === '/api/academy/complete') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const { courseId, lessonId } = parsed.body || {};
    const course = typeof courseId === 'string' && ID_RE.test(courseId) ? await getCourse(env, courseId) : null;
    const lesson = course && typeof lessonId === 'string' && ID_RE.test(lessonId) ? findLesson(course, lessonId) : null;
    if (!course || !lesson) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { lessonId: 'درس نامعتبر است.' } }, 422);
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
    const enrolled = await env.DB.prepare('SELECT 1 AS x FROM enrollments WHERE user_id = ?1 AND course_id = ?2').bind(user.id, course.id).first();
    if (!enrolled) return json({ ok: false, error: 'NOT_ENROLLED' }, 403);
    await env.DB.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, course_id, lesson_id) VALUES (?1, ?2, ?3)').bind(user.id, course.id, lesson.id).run();
    return json({ ok: true });
  }

  if (path === '/api/academy/progress') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId') || '';
    const course = ID_RE.test(courseId) ? await getCourse(env, courseId) : null;
    if (!course) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
    const enr = await env.DB.prepare('SELECT 1 AS x FROM enrollments WHERE user_id = ?1 AND course_id = ?2').bind(user.id, course.id).first();
    const rows = await env.DB.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?1 AND course_id = ?2').bind(user.id, course.id).all();
    let assessments = { results: [] };
    let legalReviews = { results: [] };
    try {
      await ensureAssessmentSchema(env.DB);
      assessments = await env.DB.prepare('SELECT lesson_id, answer_index, response_text, score, passed, submitted_at FROM lesson_assessments WHERE user_id = ?1 AND course_id = ?2').bind(user.id, course.id).all();
      await ensureLegalReviewSchema(env.DB);
      legalReviews = await env.DB.prepare('SELECT lesson_id, review_json FROM lesson_legal_reviews WHERE user_id = ?1 AND course_id = ?2').bind(user.id, course.id).all();
    } catch (error) { console.error('academy assessment history unavailable', String(error?.message || error).slice(0, 120)); }
    const reviewByLesson = new Map((legalReviews.results || []).map((r) => { try { return [r.lesson_id, JSON.parse(r.review_json)]; } catch { return [r.lesson_id, null]; } }));
    const assessmentByLesson = new Map((assessments.results || []).map((r) => [r.lesson_id, r]));
    // سوابق قبلی که فقط بر اساس پاسخ تستی قبول شده‌اند، تا ارزیابی تشریحی مجدد تکمیل‌شده محسوب نمی‌شوند.
    const validPassed = new Set((rows?.results || []).map((r) => r.lesson_id).filter((lessonId) => {
      if (!lessonLearning(course.id, lessonId)) return true;
      const assessment = assessmentByLesson.get(lessonId);
      const essayGrade = reviewByLesson.get(lessonId)?.essayAssessment;
      return Boolean(assessment?.passed && Number(assessment.score) >= 76 && essayGrade && Number(essayGrade.score) >= 60);
    }));
    return json({
      ok: true, enrolled: Boolean(enr),
      completedLessonIds: [...validPassed],
      assessments: (assessments?.results || []).map((r) => ({ lessonId: r.lesson_id, answerIndex: r.answer_index, responseText: r.response_text, score: r.score, passed: validPassed.has(r.lesson_id), submittedAt: r.submitted_at, explanation: r.passed ? lessonLearning(course.id, r.lesson_id)?.quiz.explanation || null : null, legalReview: reviewByLesson.get(r.lesson_id) || null })),
      total: course.lessons.length,
    });
  }

  return null;
}
