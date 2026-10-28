// مسیرهای آکادمی: فهرست و متن دوره‌ها (عمومی) و ثبت‌نام/پیشرفت (نیازمند ورود).
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { COURSES, courseSummaries, findCourse, findLesson } from './catalog.js';

const ID_RE = /^[a-z0-9-]{1,64}$/;

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  return user;
}

export async function handleAcademy(request, env, path) {
  // فهرست دوره‌ها
  if (path === '/api/academy/courses') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    return json({ ok: true, courses: courseSummaries() });
  }

  // جزئیات یک دوره با درس‌ها
  const detail = path.match(/^\/api\/academy\/courses\/([a-z0-9-]{1,64})$/);
  if (detail) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const course = findCourse(detail[1]);
    if (!course) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    return json({
      ok: true,
      course: {
        id: course.id,
        title: course.title,
        level: course.level,
        summary: course.summary,
        lessons: course.lessons.map((l) => ({ id: l.id, title: l.title, body: l.body })),
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
    if (typeof courseId !== 'string' || !ID_RE.test(courseId) || !findCourse(courseId)) {
      return json({ ok: false, error: 'VALIDATION_FAILED', errors: { courseId: 'دوره نامعتبر است.' } }, 422);
    }
    await env.DB
      .prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?1, ?2)')
      .bind(user.id, courseId)
      .run();
    return json({ ok: true, enrolled: true });
  }

  if (path === '/api/academy/complete') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const { courseId, lessonId } = parsed.body || {};
    const course = typeof courseId === 'string' && ID_RE.test(courseId) ? findCourse(courseId) : null;
    const lesson = course && typeof lessonId === 'string' && ID_RE.test(lessonId) ? findLesson(course, lessonId) : null;
    if (!course || !lesson) {
      return json({ ok: false, error: 'VALIDATION_FAILED', errors: { lessonId: 'درس نامعتبر است.' } }, 422);
    }
    const enrolled = await env.DB
      .prepare('SELECT 1 AS x FROM enrollments WHERE user_id = ?1 AND course_id = ?2')
      .bind(user.id, course.id)
      .first();
    if (!enrolled) return json({ ok: false, error: 'NOT_ENROLLED' }, 403);

    await env.DB
      .prepare('INSERT OR IGNORE INTO lesson_progress (user_id, course_id, lesson_id) VALUES (?1, ?2, ?3)')
      .bind(user.id, course.id, lesson.id)
      .run();
    return json({ ok: true });
  }

  if (path === '/api/academy/progress') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await requireUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId') || '';
    const course = ID_RE.test(courseId) ? findCourse(courseId) : null;
    if (!course) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    const enr = await env.DB
      .prepare('SELECT 1 AS x FROM enrollments WHERE user_id = ?1 AND course_id = ?2')
      .bind(user.id, course.id)
      .first();
    const rows = await env.DB
      .prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?1 AND course_id = ?2')
      .bind(user.id, course.id)
      .all();
    return json({
      ok: true,
      enrolled: Boolean(enr),
      completedLessonIds: (rows?.results || []).map((r) => r.lesson_id),
      total: course.lessons.length,
    });
  }

  return null;
}
