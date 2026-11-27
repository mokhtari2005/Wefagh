// بایگانی تمرین‌های کارگاه بر پایه همان جدول سوابق پروندهٔ موجود؛ بدون جدول موازی.
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { findCourse, findLesson, isPublicCourse } from './catalog.js';
import { getPublishedCase, SLUG_RE } from '../moot/caseStore.js';

const ID_RE = /^[a-z0-9-]{1,64}$/;
const META_KEY = '__academyPractice';

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

async function access(course, user) {
  if (isPublicCourse(course)) return true;
  return Array.isArray(user?.roles) && user.roles.some((r) => ['admin','super_admin','academy_manager'].includes(r));
}

async function validateContext(request, env, courseId, lessonId) {
  if (!ID_RE.test(String(courseId || '')) || !ID_RE.test(String(lessonId || ''))) return { error: json({ok:false,error:'VALIDATION_FAILED'},422) };
  const user = await currentUser(request, env);
  if (!user) return { error: json({ok:false,error:'UNAUTHENTICATED'},401) };
  const course = await courseFor(env, courseId);
  const lesson = course && findLesson(course, lessonId);
  if (!course || !lesson || !(await access(course,user))) return { error: json({ok:false,error:'NOT_FOUND'},404) };
  const enrolled = await env.DB.prepare('SELECT 1 AS x FROM enrollments WHERE user_id=?1 AND course_id=?2').bind(user.id,course.id).first();
  if (!enrolled) return { error: json({ok:false,error:'NOT_ENROLLED'},403) };
  return { user, course, lesson };
}

function parseAnswers(value) {
  try { const result=JSON.parse(value); return result&&typeof result==='object'&&!Array.isArray(result)?result:{}; }
  catch { return {}; }
}

export async function handleWorkshopPractices(request, env, path) {
  if (!path.startsWith('/api/cases/workshop-practices')) return null;
  if (!env.DB) return json({ok:false,error:'DB_NOT_CONFIGURED'},503);
  if (path === '/api/cases/workshop-practices') {
    const url = new URL(request.url);
    let body = null;
    if (request.method === 'POST') {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      body = parsed.body || {};
    }
    if (request.method !== 'GET' && request.method !== 'POST') return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST'});
    const courseId = request.method === 'POST' ? body.courseId : url.searchParams.get('courseId');
    const lessonId = request.method === 'POST' ? body.lessonId : url.searchParams.get('lessonId');
    const context = await validateContext(request,env,courseId,lessonId);
    if (context.error) return context.error;
    if (request.method === 'GET') {
      const page = Math.max(1,Math.min(1000000,Number.parseInt(url.searchParams.get('page')||'1',10)||1));
      const pageSize = Math.max(1,Math.min(50,Number.parseInt(url.searchParams.get('pageSize')||'20',10)||20));
      const offset=(page-1)*pageSize;
      const filter = "user_id=?1 AND json_extract(answers_json, '$.__academyPractice.courseId')=?2 AND json_extract(answers_json, '$.__academyPractice.lessonId')=?3";
      const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM moot_sessions WHERE '+filter).bind(context.user.id,context.course.id,context.lesson.id).first();
      const rows=await env.DB.prepare('SELECT id,case_id,title,answers_json,stage,created_at,updated_at FROM moot_sessions WHERE '+filter+' ORDER BY updated_at DESC,id DESC LIMIT ?4 OFFSET ?5')
        .bind(context.user.id,context.course.id,context.lesson.id,pageSize,offset).all();
      const practices=(rows.results||[]).map(row=>{
        const answers=parseAnswers(row.answers_json);
        return {id:row.id,case_id:row.case_id,case_title:row.title.replace(/^تمرین کارگاه:\s*/,''),
          response_text:typeof answers.responseText==='string'?answers.responseText:'',
          status:row.stage==='answers'?'submitted':'draft',created_at:row.created_at,updated_at:row.updated_at};
      });
      return json({ok:true,practices,page,pageSize,total:count?.total||0,hasMore:offset+pageSize<(count?.total||0)});
    }
    const item=typeof body.caseId==='string'&&SLUG_RE.test(body.caseId)?await getPublishedCase(env,body.caseId):null;
    const response=typeof body.responseText==='string'?body.responseText.trim():'';
    if(!item||response.length>12000)return json({ok:false,error:'VALIDATION_FAILED',message:'پرونده منتشرشده یا متن تمرین معتبر نیست.'},422);
    const answers={ [META_KEY]:{courseId:context.course.id,lessonId:context.lesson.id}, responseText:response };
    const title=('تمرین کارگاه: '+item.title).slice(0,120);
    const row=await env.DB.prepare(`INSERT INTO moot_sessions(user_id,case_id,title,answers_json,rubric_json,stage,score)
      VALUES(?1,?2,?3,?4,'[]',?5,NULL) RETURNING id`)
      .bind(context.user.id,item.id,title,JSON.stringify(answers),response.length>=30?'answers':'facts').first();
    return json({ok:true,id:row?.id,caseId:item.id,status:response.length>=30?'submitted':'draft'},201);
  }
  const match=path.match(/^\/api\/cases\/workshop-practices\/(\d{1,12})$/);
  if(!match)return json({ok:false,error:'NOT_FOUND'},404);
  const user=await currentUser(request,env);if(!user)return json({ok:false,error:'UNAUTHENTICATED'},401);
  const id=Number(match[1]);
  const row=await env.DB.prepare('SELECT id,answers_json FROM moot_sessions WHERE id=?1 AND user_id=?2').bind(id,user.id).first();
  if(!row)return json({ok:false,error:'NOT_FOUND'},404);
  const answers=parseAnswers(row.answers_json);
  if(!answers[META_KEY])return json({ok:false,error:'NOT_FOUND'},404);
  if(request.method==='DELETE'){
    await env.DB.prepare('DELETE FROM moot_sessions WHERE id=?1 AND user_id=?2').bind(id,user.id).run();
    return json({ok:true});
  }
  if(request.method!=='PATCH')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'PATCH, DELETE'});
  const parsed=await readJsonBody(request);if(parsed.error)return parsed.error;
  const response=typeof parsed.body?.responseText==='string'?parsed.body.responseText.trim():null;
  if(response===null||response.length>12000)return json({ok:false,error:'VALIDATION_FAILED'},422);
  answers.responseText=response;
  await env.DB.prepare("UPDATE moot_sessions SET answers_json=?1,stage=?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND user_id=?4")
    .bind(JSON.stringify(answers),response.length>=30?'answers':'facts',id,user.id).run();
  return json({ok:true,status:response.length>=30?'submitted':'draft'});
}
