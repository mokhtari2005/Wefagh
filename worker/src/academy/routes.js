// مسیرهای آکادمی: فهرست و متن دوره‌ها (عمومی) و ثبت‌نام/پیشرفت (نیازمند ورود).
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { COURSES, courseSummaries, findCourse, findLesson, isPublicCourse } from './catalog.js';

const MANAGER_ROLES = ['admin', 'super_admin', 'academy_manager'];
const isManager = (user) => Boolean(user && Array.isArray(user.roles) && user.roles.some((r) => MANAGER_ROLES.includes(r)));

/** دوره‌های منتشرشده برای همه؛ پیش‌نویس‌ها فقط برای مدیر آکادمی. */
async function canAccessCourse(request, env, course) {
  if (isPublicCourse(course)) return true;
  return isManager(await currentUser(request, env));
}

const ID_RE = /^[a-z0-9-]{1,64}$/;

async function publishedCourses(env) {
  if (!env.DB) return [];
  let rows;
  try {
    rows = await env.DB.prepare("SELECT slug, title, summary, payload_json FROM admin_content WHERE kind = 'course' AND status = 'published' ORDER BY title LIMIT 200").all();
  } catch (error) {
    // جدول محتوای مدیریت در این دیتابیس هنوز نیست: دوره‌های داخلی همچنان نمایش داده می‌شوند.
    console.error('managed course content unavailable', String(error?.message || error).slice(0, 120));
    return [];
  }
  return (rows?.results || []).flatMap((row) => {
    try { const payload = JSON.parse(row.payload_json); return [{ id: row.slug, title: row.title, summary: row.summary, level: payload.level, lessons: payload.lessons, status: 'published' }]; } catch { return []; }
  });
}

async function getCourse(env, id) {
  const builtIn = findCourse(id);
  if (builtIn) return builtIn;
  if (!env.DB) return null;
  let row;
  try {
    row = await env.DB.prepare("SELECT slug, title, summary, payload_json FROM admin_content WHERE kind = 'course' AND status = 'published' AND slug = ?1").bind(id).first();
  } catch (error) {
    console.error('managed course content unavailable', String(error?.message || error).slice(0, 120));
    return null;
  }
  if (!row) return null;
  try { const payload = JSON.parse(row.payload_json); return { id: row.slug, title: row.title, summary: row.summary, level: payload.level, lessons: payload.lessons, status: 'published' }; } catch { return null; }
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  return user;
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
  // فهرست دوره‌ها
  if (path === '/api/academy/courses') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const managed = await publishedCourses(env);
    const summaries = managed.map((c) => ({ id: c.id, title: c.title, level: c.level, summary: c.summary, lessonCount: c.lessons.length, status: 'published' }));
    // نسخهٔ منتشرشدهٔ پنل مدیریت جای نسخهٔ داخلی با همان شناسه را می‌گیرد.
    const managedIds = new Set(summaries.map((c) => c.id));
    const all = [...courseSummaries().filter((c) => !managedIds.has(c.id)), ...summaries];
    // وضعیت ثبت‌نام فقط برای کاربر واردشده؛ برای مهمان همه false است.
    const enrolledIds = await enrolledCourseIds(request, env);
    return json({ ok: true, courses: all.map((c) => ({ ...c, enrolled: enrolledIds.has(c.id), enrollable: c.status === 'published' })) });
  }

  // جزئیات یک دوره با درس‌ها
  const detail = path.match(/^\/api\/academy\/courses\/([a-z0-9-]{1,64})$/);
  if (detail) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const course = findCourse(detail[1]) || await getCourse(env, detail[1]);
    if (!course) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
    return json({
      ok: true,
      course: {
        id: course.id,
        title: course.title,
        level: course.level,
        summary: course.summary,
        status: course.status || 'published',
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
    if (typeof courseId !== 'string' || !ID_RE.test(courseId) || !(findCourse(courseId) || await getCourse(env, courseId))) {
      return json({ ok: false, error: 'VALIDATION_FAILED', errors: { courseId: 'دوره نامعتبر است.' } }, 422);
    }
    const enrollTarget = findCourse(courseId) || await getCourse(env, courseId);
    if (!(await canAccessCourse(request, env, enrollTarget))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
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
    const course = typeof courseId === 'string' && ID_RE.test(courseId) ? (findCourse(courseId) || await getCourse(env, courseId)) : null;
    const lesson = course && typeof lessonId === 'string' && ID_RE.test(lessonId) ? findLesson(course, lessonId) : null;
    if (!course || !lesson) {
      return json({ ok: false, error: 'VALIDATION_FAILED', errors: { lessonId: 'درس نامعتبر است.' } }, 422);
    }
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
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
    const course = ID_RE.test(courseId) ? (findCourse(courseId) || await getCourse(env, courseId)) : null;
    if (!course) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    if (!(await canAccessCourse(request, env, course))) return json({ ok: false, error: 'COURSE_NOT_PUBLISHED' }, 403);
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
