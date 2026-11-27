// خلاصهٔ داشبورد شخصی: فقط داده‌های متعلق به کاربر واردشده.
import { json } from './http.js';
import { currentUser } from './auth/routes.js';
import { COURSES } from './academy/catalog.js';

export async function handleDashboard(request, env, path) {
  if (path !== '/api/dashboard/summary') return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  // جدول‌های اختیاری (تمرین‌ها و محتوای مدیریت) ممکن است در دیتابیس هنوز نباشند؛ خطا فقط ثبت می‌شود و بخش خالی می‌ماند.
  const optional = async (name, run) => {
    try {
      return await run();
    } catch (error) {
      console.error('dashboard optional source unavailable', name, String(error?.message || error).slice(0, 120));
      return { results: [] };
    }
  };
  const [enrollmentRows, progressRows, mootRows, deadlineRows, managedCourseRows] = await Promise.all([
    env.DB.prepare('SELECT course_id FROM enrollments WHERE user_id = ?1 ORDER BY created_at DESC').bind(user.id).all(),
    env.DB.prepare('SELECT course_id, lesson_id FROM lesson_progress WHERE user_id = ?1').bind(user.id).all(),
    optional('moot_sessions', () => env.DB.prepare('SELECT id, case_id, title, stage, score, updated_at FROM moot_sessions WHERE user_id = ?1 ORDER BY updated_at DESC, id DESC LIMIT 100').bind(user.id).all()),
    env.DB.prepare("SELECT id, title, due_date, kind, done FROM deadlines WHERE user_id = ?1 AND done = 0 AND due_date >= ?2 ORDER BY due_date ASC, id ASC LIMIT 5").bind(user.id, new Date().toISOString().slice(0, 10)).all(),
    optional('admin_content', () => env.DB.prepare("SELECT slug, title, payload_json FROM admin_content WHERE kind = 'course' AND status = 'published'").all()),
  ]);

  const enrolledIds = (enrollmentRows?.results || []).map((row) => row.course_id);
  const completed = new Set((progressRows?.results || []).map((row) => `${row.course_id}:${row.lesson_id}`));
  const managedCourses = (managedCourseRows?.results || []).flatMap((row) => { try { const payload = JSON.parse(row.payload_json); return [{ id: row.slug, title: row.title, lessons: payload.lessons }]; } catch { return []; } });
  const allCourses = [...COURSES, ...managedCourses];
  const courses = enrolledIds.map((id) => {
    const course = allCourses.find((item) => item.id === id);
    if (!course) return null;
    const completedLessons = course.lessons.filter((lesson) => completed.has(`${course.id}:${lesson.id}`)).length;
    return { id: course.id, title: course.title, completedLessons, totalLessons: course.lessons.length,
      percent: Math.round((completedLessons / course.lessons.length) * 100) };
  }).filter(Boolean);
  const sessions = (mootRows?.results || []).map((row) => ({
    id: row.id, caseId: row.case_id, title: row.title, stage: row.stage,
    score: row.score, updatedAt: row.updated_at,
  }));
  const deadlines = (deadlineRows?.results || []).map((row) => ({
    id: row.id, title: row.title, dueDate: row.due_date, kind: row.kind,
  }));

  return json({ ok: true, summary: {
    enrolledCourseCount: courses.length,
    completedLessonCount: courses.reduce((sum, course) => sum + course.completedLessons, 0),
    totalEnrolledLessons: courses.reduce((sum, course) => sum + course.totalLessons, 0),
    mootSessionCount: sessions.length,
    scoredSessionCount: sessions.filter((session) => Number.isInteger(session.score)).length,
    averageScore: (() => { const scores = sessions.filter((session) => Number.isInteger(session.score)).map((session) => session.score); return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null; })(),
    courses, recentSessions: sessions.slice(0, 5), upcomingDeadlines: deadlines,
  } });
}
