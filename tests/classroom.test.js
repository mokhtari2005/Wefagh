import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { createTestDb } from './helpers/d1-sqlite.js';

async function setup() {
  const db=createTestDb();
  const admin=db.raw.prepare("INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES('admin@class.test','x','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  db.raw.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'super_admin')").run(admin.id);
  const member=db.raw.prepare("INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES('member@class.test','x','عضو آزمایشی','2026-01-01T00:00:00Z') RETURNING id").get();
  const adminToken='classroom-admin-session-token';
  const memberToken='classroom-member-session-token';
  for(const [token,user] of [[adminToken,admin],[memberToken,member]]) {
    db.raw.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(await hashToken(token),user.id,'2099-01-01T00:00:00.000Z');
  }
  return {db,env:{DB:db},adminCookie:'wefagh_session='+adminToken,memberCookie:'wefagh_session='+memberToken};
}
function req(path,{method='GET',body,cookie}={}) {
  const headers={};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;
  return new Request('https://mokhtari.ir'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
test('کلاس آنلاین فقط برای مدیر ایجاد می‌شود و اعضای تأییدشده فهرست آن را می‌بینند',async()=>{
  const {env,adminCookie,memberCookie}=await setup();
  const payload={title:'کارگاه آزمایشی دادرسی',description:'توضیح کلاس',startsAt:new Date(Date.now()+60000).toISOString(),durationMinutes:60,guestEnabled:true};
  assert.equal((await worker.fetch(req('/api/admin/classroom/sessions',{method:'POST',body:payload}),env)).status,401);
  const denied=await worker.fetch(req('/api/admin/classroom/sessions',{method:'POST',body:payload,cookie:memberCookie}),env);
  assert.equal(denied.status,403);
  const created=await worker.fetch(req('/api/admin/classroom/sessions',{method:'POST',body:payload,cookie:adminCookie}),env);
  assert.equal(created.status,201);
  const data=await created.json();
  assert.ok(data.guestCode);
  const list=await worker.fetch(req('/api/classroom/sessions',{cookie:memberCookie}),env);
  assert.equal(list.status,200);
  const sessions=(await list.json()).sessions;
  assert.equal(sessions.length,1);
  assert.equal(sessions[0].title,payload.title);
  assert.equal('roomName' in sessions[0],false);
  const joined=await worker.fetch(req('/api/classroom/sessions/'+data.sessionId+'/join',{method:'POST',body:{},cookie:memberCookie}),env);
  assert.equal(joined.status,200);
  assert.ok((await joined.json()).roomName.startsWith('wefagh-'));
  assert.equal((await worker.fetch(req('/api/classroom/sessions/'+data.sessionId+'/heartbeat',{method:'POST',body:{},cookie:memberCookie}),env)).status,200);
  const attendance=await worker.fetch(req('/api/admin/classroom/sessions/'+data.sessionId+'/attendance',{cookie:adminCookie}),env);
  assert.equal(attendance.status,200);
  assert.equal((await attendance.json()).attendance[0].attendee_type,'عضو');
});
test('کد دعوت مهمان هش‌شده بررسی می‌شود و مهمان در گزارش حضور ثبت می‌شود',async()=>{
  const {env,adminCookie}=await setup();
  const created=await worker.fetch(req('/api/admin/classroom/sessions',{method:'POST',body:{
    title:'جلسه مهمان',startsAt:new Date(Date.now()+60000).toISOString(),durationMinutes:45,guestEnabled:true,
  },cookie:adminCookie}),env);
  const data=await created.json();
  const bad=await worker.fetch(req('/api/classroom/guest/'+data.sessionId+'/join',{method:'POST',body:{code:'wrong-code',name:'مهمان آزمایشی'}}),env);
  assert.equal(bad.status,403);
  const good=await worker.fetch(req('/api/classroom/guest/'+data.sessionId+'/join',{method:'POST',body:{code:data.guestCode,name:'مهمان آزمایشی'}}),env);
  assert.equal(good.status,200);
  const guest=await good.json();
  assert.ok(guest.guestToken);
  const pulse=await worker.fetch(req('/api/classroom/guest/'+data.sessionId+'/heartbeat',{method:'POST',body:{guestToken:guest.guestToken}}),env);
  assert.equal(pulse.status,200);
  const attendance=await worker.fetch(req('/api/admin/classroom/sessions/'+data.sessionId+'/attendance',{cookie:adminCookie}),env);
  assert.equal((await attendance.json()).attendance[0].attendee_type,'مهمان');
});
test('ورود به کلاس لغوشده یا خارج از بازه مجاز نیست',async()=>{
  const {env,adminCookie,memberCookie}=await setup();
  const created=await worker.fetch(req('/api/admin/classroom/sessions',{method:'POST',body:{
    title:'کلاس لغوشده',startsAt:new Date(Date.now()+60000).toISOString(),durationMinutes:30,
  },cookie:adminCookie}),env);
  const id=(await created.json()).sessionId;
  await worker.fetch(req('/api/admin/classroom/sessions/'+id,{method:'PATCH',body:{status:'cancelled'},cookie:adminCookie}),env);
  const joined=await worker.fetch(req('/api/classroom/sessions/'+id+'/join',{method:'POST',body:{},cookie:memberCookie}),env);
  assert.equal(joined.status,409);
});
