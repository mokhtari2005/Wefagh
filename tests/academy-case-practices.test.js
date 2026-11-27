import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import batch01 from '../worker/src/moot/bank/batch-01.js';
import { createTestDb } from './helpers/d1-sqlite.js';

let DatabaseSync;
let sqliteAvailable = true;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { sqliteAvailable = false; }
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';

function req(path, { method='GET', body, cookie }={}) {
  const headers={}; if(body!==undefined)headers['content-type']='application/json'; if(cookie)headers.cookie=cookie;
  return new Request('https://mokhtari.ir'+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
}

async function setup(caseCount=3) {
  const db=createTestDb();
  const admin=db.raw.prepare("INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES('admin@academy.test','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  const base=batch01[0];
  for(let i=0;i<caseCount;i++){
    const id=(base.id+'-academy-'+String(i+1)).slice(0,64);
    const payload={...base,id,title:'پرونده آموزشی '+(i+1),area:base.area||'مدنی',difficulty:base.difficulty||'medium',subject:base.subject||'موضوع آموزشی'};
    db.raw.prepare("INSERT INTO admin_content(kind,slug,title,summary,status,payload_json,created_by) VALUES('case',?,?,?,'published',?,?)")
      .run(id,payload.title,payload.subject.padEnd(10,'.'),JSON.stringify(payload),admin.id);
  }
  const user=db.raw.prepare("INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES('learner@academy.test','h','کارآموز','2026-01-01T00:00:00Z') RETURNING id").get();
  db.raw.prepare("INSERT INTO enrollments(user_id,course_id) VALUES(?,?)").run(user.id,'civil-litigation-practice');
  const token='academy-case-practice-session-token';
  db.raw.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await hashToken(token),user.id,'2099-01-01T00:00:00.000Z');
  return {env:{DB:db},cookie:'wefagh_session='+token,db};
}

test('بانک پرونده‌ها بیش از ۵۰۰ مورد را با صفحه‌بندی قابل دسترس می‌کند', {skip}, async()=>{
  const {env}=await setup(35);
  const first=await (await worker.fetch(req('/api/cases?page=1&pageSize=20'),env)).json();
  const second=await (await worker.fetch(req('/api/cases?page=2&pageSize=20'),env)).json();
  assert.equal(first.total,35);
  assert.equal(first.cases.length,20);
  assert.equal(first.hasMore,true);
  assert.equal(second.cases.length,15);
  assert.equal(second.hasMore,false);
});

test('هر کاربر می‌تواند چند پرونده مستقل را در یک درس کارگاه بایگانی کند', {skip}, async()=>{
  const {env,cookie}=await setup(3);
  const bank=await (await worker.fetch(req('/api/cases?pageSize=10'),env)).json();
  const ids=bank.cases.slice(0,2).map(x=>x.id);
  for(const caseId of ids){
    const detail=await worker.fetch(req('/api/cases/'+caseId),env);
    assert.equal(detail.status,200,'case detail: '+JSON.stringify(await detail.clone().json()));
    const created=await worker.fetch(req('/api/cases/workshop-practices',{method:'POST',cookie,body:{
      courseId:'civil-litigation-practice',lessonId:'l1',caseId,responseText:'تحلیل مستقل این پرونده آموزشی برای ارزیابی مهارت عملی کارآموز.'
    }}),env);
    assert.equal(created.status,201,JSON.stringify(await created.clone().json()));
  }
  const history=await worker.fetch(req('/api/cases/workshop-practices?courseId=civil-litigation-practice&lessonId=l1',{cookie}),{...env});
  assert.equal(history.status,200);
  const body=await history.json();
  assert.equal(body.total,2);
  assert.deepEqual(new Set(body.practices.map(x=>x.case_id)),new Set(ids));
});
