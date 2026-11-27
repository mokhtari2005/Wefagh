// تمرین‌های مستقل کارگاه بر پایه پرونده‌های منتشرشده بانک مشترک.
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { findCourse, findLesson, isPublicCourse } from './catalog.js';
import { getPublishedCase, SLUG_RE } from '../moot/caseStore.js';

const ID_RE = /^[a-z0-9-]{1,64}$/;
const ready = new WeakMap();

async function ensureSchema(db) {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.prepare(`CREATE TABLE IF NOT EXISTS academy_case_practices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      response_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`).run()
      .then(() => db.prepare('CREATE INDEX IF NOT EXISTS idx_academy_case_practices_owner ON academy_case_practices(user_id, course_id, lesson_id, id DESC)').run())
      .catch((error) => { ready.delete(db); throw error; });
    ready.set(db, pending);
  }
  await pending;
}

async function courseFor(env, id) {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT slug,title,summary,payload_json FROM admin_content WHERE kind='course' AND status='published' AND slug=?1").bind(id).first();
    if (row) {
      try { const p=JSON.parse(row.payload_json); return { id:row.slug,title:row.title,summary:row.summary,level:p.level,format:p.format==='workshop'?'workshop':'course',lessons:p.lessons,status:'published' }; }
      catch { return null; }
    }
  }
  return findCourse(id);
}

async function access(request, env, course, user) {
  if (isPublicCourse(course)) return true;
  return Array.isArray(user?.roles) && user.roles.some((r) => ['admin','super_admin','academy_manager'].includes(r));
}

async function validateContext(request, env, courseId, lessonId) {
  if (!ID_RE.test(String(courseId || '')) || !ID_RE.test(String(lessonId || ''))) return { error: json({ok:false,error:'VALIDATION_FAILED'},422) };
  const user = await currentUser(request, env);
  if (!user) return { error: json({ok:false,error:'UNAUTHENTICATED'},401) };
  const course = await courseFor(env, courseId);
  const lesson = course && findLesson(course, lessonId);
  if (!course || !lesson || !(await access(request,env,course,user))) return { error: json({ok:false,error:'NOT_FOUND'},404) };
  const enrolled = await env.DB.prepare('SELECT 1 AS x FROM enrollments WHERE user_id=?1 AND course_id=?2').bind(user.id,course.id).first();
  if (!enrolled) return { error: json({ok:false,error:'NOT_ENROLLED'},403) };
  return { user, course, lesson };
}

export async function handleWorkshopPractices(request, env, path) {
  if (!path.startsWith('/api/cases/workshop-practices')) return null;
  if (!env.DB) return json({ok:false,error:'DB_NOT_CONFIGURED'},503);
  await ensureSchema(env.DB);
  if (path === '/api/cases/workshop-practices') {
    const url = new URL(request.url);
    const context = await validateContext(request,env,url.searchParams.get('courseId'),url.searchParams.get('lessonId'));
    if (context.error) return context.error;
    if (request.method === 'GET') {
      const page = Math.max(1,Math.min(1000000,Number.parseInt(url.searchParams.get('page')||'1',10)||1));
      const pageSize = Math.max(1,Math.min(50,Number.parseInt(url.searchParams.get('pageSize')||'20',10)||20));
      const offset=(page-1)*pageSize;
      const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM academy_case_practices WHERE user_id=?1 AND course_id=?2 AND lesson_id=?3').bind(context.user.id,context.course.id,context.lesson.id).first();
      const rows=await env.DB.prepare(`SELECT p.id,p.case_id,p.response_text,p.status,p.created_at,p.updated_at,c.title AS case_title
        FROM academy_case_practices p LEFT JOIN admin_content c ON c.kind='case' AND c.slug=p.case_id
        WHERE p.user_id=?1 AND p.course_id=?2 AND p.lesson_id=?3 ORDER BY p.id DESC LIMIT ?4 OFFSET ?5`)
        .bind(context.user.id,context.course.id,context.lesson.id,pageSize,offset).all();
      return json({ok:true,practices:rows.results||[],page,pageSize,total:count?.total||0,hasMore:offset+pageSize<(count?.total||0)});
    }
    if (request.method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST'});
    const parsed=await readJsonBody(request); if(parsed.error)return parsed.error;
    const body=parsed.body||{};
    const item=typeof body.caseId==='string'&&SLUG_RE.test(body.caseId)?await getPublishedCase(env,body.caseId):null;
    const response=typeof body.responseText==='string'?body.responseText.trim():'';
    if(!item||response.length>12000) return json({ok:false,error:'VALIDATION_FAILED',message:'پرونده منتشرشده یا متن تمرین معتبر نیست.'},422);
    const row=await env.DB.prepare(`INSERT INTO academy_case_practices(user_id,course_id,lesson_id,case_id,response_text,status)
      VALUES(?1,?2,?3,?4,?5,?6) RETURNING id`)
      .bind(context.user.id,context.course.id,context.lesson.id,item.id,response,response.length>=30?'submitted':'draft').first();
    return json({ok:true,id:row?.id,caseId:item.id,status:response.length>=30?'submitted':'draft'},201);
  }
  const match=path.match(/^\/api\/cases\/workshop-practices\/(\d{1,12})$/);
  if(!match)return json({ok:false,error:'NOT_FOUND'},404);
  const user=await currentUser(request,env); if(!user)return json({ok:false,error:'UNAUTHENTICATED'},401);
  const id=Number(match[1]);
  const row=await env.DB.prepare('SELECT * FROM academy_case_practices WHERE id=?1 AND user_id=?2').bind(id,user.id).first();
  if(!row)return json({ok:false,error:'NOT_FOUND'},404);
  if(request.method==='DELETE'){
    await env.DB.prepare('DELETE FROM academy_case_practices WHERE id=?1 AND user_id=?2').bind(id,user.id).run();
    return json({ok:true});
  }
  if(request.method!=='PATCH')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'PATCH, DELETE'});
  const parsed=await readJsonBody(request);if(parsed.error)return parsed.error;
  const response=typeof parsed.body?.responseText==='string'?parsed.body.responseText.trim():null;
  if(response===null||response.length>12000)return json({ok:false,error:'VALIDATION_FAILED'},422);
  await env.DB.prepare("UPDATE academy_case_practices SET response_text=?1,status=?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND user_id=?4")
    .bind(response,response.length>=30?'submitted':'draft',id,user.id).run();
  return json({ok:true,status:response.length>=30?'submitted':'draft'});
}
