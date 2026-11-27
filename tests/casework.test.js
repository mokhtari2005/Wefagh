import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/d1-sqlite.js';
import { hashToken } from '../worker/src/auth/token.js';
import worker from '../worker/src/index.js';

let DatabaseSync;
let sqliteAvailable = true;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { sqliteAvailable = false; }
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';

async function setup() {
  const db = createTestDb();
  const user = db.raw.prepare("INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('casework@example.test','hash','کاربر پرونده','2026-01-01T00:00:00Z') RETURNING id").get();
  const other = db.raw.prepare("INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('other-casework@example.test','hash','کاربر دیگر','2026-01-01T00:00:00Z') RETURNING id").get();
  const token = 'casework-session-token-123456';
  const otherToken = 'other-casework-session-token-123456';
  db.raw.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await hashToken(token),user.id,'2099-01-01T00:00:00Z');
  db.raw.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await hashToken(otherToken),other.id,'2099-01-01T00:00:00Z');
  return { db, env:{DB:db,B2_ENDPOINT:'https://s3.us-east-005.backblazeb2.com',B2_BUCKET:'test-bucket',B2_KEY_ID:'test-key',B2_APPLICATION_KEY:'test-secret'}, cookie:'wefagh_session='+token, otherCookie:'wefagh_session='+otherToken };
}
function req(path,{method='GET',body,cookie,headers={}}={}) {
  const h=new Headers(headers);
  if(body!==undefined)h.set('content-type','application/json');
  if(cookie)h.set('cookie',cookie);
  return new Request('https://mokhtari.ir'+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined});
}

test('پرونده بدون فایل ایجاد می‌شود، خدمت و اسناد به همان پرونده متصل می‌مانند', {skip}, async()=>{
  const {env,cookie}=await setup();
  const created=await worker.fetch(req('/api/casework/cases',{method:'POST',cookie,body:{name:'پرونده مطالبه وجه',caseNumber:'1405/123',parties:[{name:'خواهان نمونه',role:'خواهان'}],subject:'مطالبه وجه'}}),env);
  assert.equal(created.status,201);
  const caseId=(await created.json()).case.id;
  const first=await worker.fetch(req('/api/casework/cases/'+caseId,{cookie}),env);
  assert.equal(first.status,200);
  assert.equal((await first.json()).documents.length,0);
  const service=await worker.fetch(req('/api/casework/cases/'+caseId+'/services',{method:'POST',cookie,body:{type:'defense',title:'تنظیم لایحه دفاعیه'}}),env);
  assert.equal(service.status,201);
  const serviceId=(await service.json()).service.id;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(null,{status:200});
  try{
    const bytes=new TextEncoder().encode('%PDF-1.7\ncasework fixture');
    const uploaded=await worker.fetch(new Request('https://mokhtari.ir/api/casework/cases/'+caseId+'/documents',{
      method:'POST',headers:{cookie,'content-type':'application/pdf','x-file-name':encodeURIComponent('پیوست.pdf'),'x-service-id':serviceId,'x-document-type':'evidence'},body:bytes
    }),env);
    assert.equal(uploaded.status,201);
    const detail=await (await worker.fetch(req('/api/casework/cases/'+caseId,{cookie}),env)).json();
    assert.equal(detail.services.length,1);
    assert.equal(detail.documents.length,1);
    assert.equal(detail.documents[0].serviceId,serviceId);
    assert.equal(detail.case.documentCount,1);
    assert.ok(detail.timeline.some(x=>x.event_type==='document_uploaded'));
    const generated=await worker.fetch(new Request('https://mokhtari.ir/api/casework/cases/'+caseId+'/documents',{
      method:'POST',headers:{cookie,'content-type':'text/plain','x-file-name':encodeURIComponent('پیش‌نویس.txt'),'x-service-id':serviceId,'x-document-type':'draft','x-source-kind':'generated'},body:new TextEncoder().encode('متن پیش‌نویس تولیدشده برای آزمون بایگانی')
    }),env);
    assert.equal(generated.status,201);
    assert.equal((await generated.json()).document.source,'generated');
    const documentId=detail.documents[0].id;
    assert.equal((await worker.fetch(req('/api/casework/documents/'+documentId,{method:'PATCH',cookie,body:{status:'deleted'}}),env)).status,200);
    assert.equal((await worker.fetch(req('/api/casework/documents/'+documentId+'/restore',{method:'POST',cookie,body:{} }),env)).status,200);
  }finally{globalThis.fetch=oldFetch;}
});

test('مالکیت پرونده و سند در تمام مسیرها کنترل می‌شود', {skip}, async()=>{
  const {env,cookie,otherCookie}=await setup();
  const created=await worker.fetch(req('/api/casework/cases',{method:'POST',cookie,body:{name:'پرونده خصوصی'}}),env);
  const id=(await created.json()).case.id;
  assert.equal((await worker.fetch(req('/api/casework/cases/'+id,{cookie:otherCookie}),env)).status,404);
  assert.equal((await worker.fetch(req('/api/casework/cases/'+id+'/services',{method:'POST',cookie:otherCookie,body:{type:'review',title:'بررسی قرارداد'}}),env)).status,404);
  assert.equal((await worker.fetch(req('/api/casework/cases'),env)).status,401);
});

test('جست‌وجو، فیلتر وضعیت و انتقال نرم پرونده به سطل بازیابی', {skip}, async()=>{
  const {env,cookie}=await setup();
  const create=async(name,status='draft')=>(await worker.fetch(req('/api/casework/cases',{method:'POST',cookie,body:{name,status}}),env)).json();
  const a=await create('پرونده قرارداد اجاره','active');
  await create('پرونده مطالبه خسارت','completed');
  const found=await (await worker.fetch(req('/api/casework/cases?q=اجاره&status=active',{cookie}),env)).json();
  assert.equal(found.total,1);
  assert.equal(found.cases[0].id,a.case.id);
  assert.equal((await worker.fetch(req('/api/casework/cases/'+a.case.id,{method:'DELETE',cookie}),env)).status,200);
  const after=await (await worker.fetch(req('/api/casework/cases',{cookie}),env)).json();
  assert.equal(after.total,1);
  assert.equal((await worker.fetch(req('/api/casework/cases/'+a.case.id+'/restore',{method:'POST',cookie,body:{} }),env)).status,200);
  const restored=await (await worker.fetch(req('/api/casework/cases',{cookie}),env)).json();
  assert.equal(restored.total,2);
});


test('گفت‌وگوی دستیار به پرونده و خدمت انتخاب‌شده متصل می‌شود', {skip}, async()=>{
  const {env,cookie}=await setup();
  const created=await worker.fetch(req('/api/casework/cases',{method:'POST',cookie,body:{name:'پرونده پیگیری قرارداد'}}),env);
  const caseId=(await created.json()).case.id;
  const service=await worker.fetch(req('/api/casework/cases/'+caseId+'/services',{method:'POST',cookie,body:{type:'assistant_consult',title:'مشاوره حقوقی'}}),env);
  const serviceId=(await service.json()).service.id;
  const thread=await worker.fetch(req('/api/ai/threads',{method:'POST',cookie,body:{title:'مشاوره پرونده',caseId,caseworkServiceId:serviceId}}),env);
  assert.equal(thread.status,201);
  const threadData=(await thread.json()).thread;
  assert.equal(threadData.case_id,caseId);
  assert.equal(threadData.casework_service_id,serviceId);
  const events=await (await worker.fetch(req('/api/casework/cases/'+caseId,{cookie}),env)).json();
  assert.ok(events.timeline.some(x=>x.event_type==='assistant_thread_linked'));
  assert.equal((await worker.fetch(req('/api/ai/threads',{method:'POST',cookie,body:{title:'خدمت نامرتبط',caseId,caseworkServiceId:'00000000-0000-4000-8000-000000000000'}}),env)).status,404);
});

test('سوابق استفاده از محاسبه‌گر در حساب کاربر و بایگانی پرونده ذخیره می‌شود', {skip}, async()=>{
  const {env,cookie,otherCookie}=await setup();
  const created=await worker.fetch(req('/api/casework/cases',{method:'POST',cookie,body:{name:'پرونده محاسبه خسارت'}}),env);
  const caseId=(await created.json()).case.id;
  const service=await worker.fetch(req('/api/casework/cases/'+caseId+'/services',{method:'POST',cookie,body:{type:'analysis',title:'بررسی خسارت'}}),env);
  const serviceId=(await service.json()).service.id;
  const saved=await worker.fetch(req('/api/casework/actions',{method:'POST',cookie,body:{
    actionType:'calculator',calculatorKey:'delay',title:'خسارت تأخیر تأدیه',caseId,serviceId,
    inputData:{'اصل دین':'۱۰۰۰۰۰۰۰۰','تاریخ شروع':'۱۴۰۴/۰۱/۰۱'},
    resultData:{text:'مبلغ محاسبه‌شده: ۱۲٬۰۰۰٬۰۰۰ ریال'}
  }}),env);
  assert.equal(saved.status,201);
  const actionId=(await saved.json()).id;
  const listed=await (await worker.fetch(req('/api/casework/actions?limit=10',{cookie}),env)).json();
  assert.equal(listed.actions[0].id,actionId);
  assert.equal(listed.actions[0].caseId,caseId);
  assert.equal(listed.actions[0].inputData['اصل دین'],'۱۰۰۰۰۰۰۰۰');
  const detail=await (await worker.fetch(req('/api/casework/cases/'+caseId,{cookie}),env)).json();
  assert.equal(detail.calculatorActions.length,1);
  assert.ok(detail.timeline.some(x=>x.event_type==='calculator_used'));
  assert.equal((await worker.fetch(req('/api/casework/actions',{method:'POST',cookie:otherCookie,body:{
    actionType:'calculator',calculatorKey:'delay',title:'محاسبه غیرمجاز',caseId
  }}),env)).status,404);
  const personal=await worker.fetch(req('/api/casework/actions',{method:'POST',cookie,body:{
    actionType:'calculator',calculatorKey:'court',title:'هزینه دادرسی',inputData:{مبلغ:'۵۰۰۰'},resultData:{text:'گزارش'}
  }}),env);
  assert.equal(personal.status,201);
  const personalList=await (await worker.fetch(req('/api/casework/actions',{cookie}),env)).json();
  assert.equal(personalList.actions.length,2);
  assert.equal(personalList.actions.find(x=>x.title==='هزینه دادرسی').caseId,null);
});

test('نوع خدمت داوری در مدیریت پرونده‌ها عرضه نمی‌شود', {skip}, async()=>{
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {join,dirname}=await import('node:path');
  const source=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../site/js/casework.js'),'utf8');
  assert.doesNotMatch(source,/arbitration_award|تنظیم رأی داوری/u);
});
