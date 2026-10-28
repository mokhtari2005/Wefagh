import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
let DatabaseSync; try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
const skip = !DatabaseSync && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
function d1Like(db) { return { prepare(sql) { const stmt = db.prepare(sql.replace(/\?\d+/g, '?')); return { all: async (...a) => ({ results: stmt.all(...a) }), first: async (...a) => stmt.get(...a) ?? null, run: async (...a) => { stmt.run(...a); return { success: true }; }, bind(...a) { return { first: async () => stmt.get(...a) ?? null, all: async () => ({ results: stmt.all(...a) }), run: async () => { stmt.run(...a); return { success: true }; } }; } }; } }; }
async function setup(role = 'super_admin') {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON;');
  for (const file of ['0001_init.sql','0002_auth.sql','0003_academy.sql','0004_deadlines.sql','0005_casework.sql','0006_admin_content.sql','0007_admin_media.sql']) db.exec(readFileSync(join(here,'..','worker','migrations',file),'utf8'));
  const u = db.prepare("INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES ('media-admin@example.com','h','مدیر رسانه','2026-01-01T00:00:00Z') RETURNING id").get();
  if (role) db.prepare('INSERT INTO user_roles(user_id,role) VALUES (?,?)').run(u.id, role);
  const token = `media-admin-token-${role || 'none'}-long-enough`;
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(await hashToken(token),u.id,'2099-01-01T00:00:00.000Z');
  return { env: { DB: d1Like(db) }, cookie: `wefagh_session=${token}` };
}
function req(path,{method='GET',body,cookie}={}) { const headers={}; if(body!==undefined) headers['content-type']='application/json'; if(cookie) headers.cookie=cookie; return new Request(`https://wefagh.ir${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}); }
const article = { kind:'article',slug:'evidence-basics-managed',title:'مبانی ارزیابی دلیل',summary:'یادداشتی آموزشی دربارهٔ ارزیابی و تحلیل مدارک در یک اختلاف فرضی.',status:'draft',payload:{author:'تحریریهٔ وفاق',publishedAt:'2026-10-28',body:['در ارزیابی دلیل باید ارتباط آن با موضوع اختلاف، منشأ و قابلیت اتکای آن را با دقت بررسی کرد.']}};

test('مدیریت رسانه نیازمند نقش مدیر است و مقالهٔ منتشرشده به API عمومی می‌رسد', { skip }, async () => {
  const {env,cookie}=await setup();
  assert.equal((await worker.fetch(req('/api/admin/media',{method:'POST',body:article}),env)).status,401);
  const created=await worker.fetch(req('/api/admin/media',{method:'POST',body:article,cookie}),env);
  assert.equal(created.status,201); const id=(await created.json()).id;
  assert.equal((await worker.fetch(req('/api/media/articles'),env)).status,200);
  let list=await (await worker.fetch(req('/api/media/articles'),env)).json();
  assert.ok(!list.articles.some(a=>a.slug===article.slug));
  assert.equal((await worker.fetch(req(`/api/admin/media/${id}`,{method:'PATCH',body:{status:'published'},cookie}),env)).status,200);
  list=await (await worker.fetch(req('/api/media/articles'),env)).json(); assert.ok(list.articles.some(a=>a.slug===article.slug));
  const detail=await (await worker.fetch(req(`/api/media/articles/${article.slug}`,{},),env)).json();
  assert.equal(detail.article.body[0],article.payload.body[0]);
  assert.equal((await worker.fetch(req(`/api/admin/media/${id}`,{method:'DELETE',cookie}),env)).status,409);
  assert.equal((await worker.fetch(req(`/api/admin/media/${id}`,{method:'PATCH',body:{status:'draft'},cookie}),env)).status,200);
  assert.equal((await worker.fetch(req(`/api/admin/media/${id}`,{method:'DELETE',cookie}),env)).status,200);
  assert.equal((await worker.fetch(req(`/api/media/articles/${article.slug}`),env)).status,404);
});

test('رسانهٔ نامعتبر یا نشانی صوتی غیر HTTPS رد می‌شود', { skip }, async () => {
  const {env,cookie}=await setup();
  const bad={kind:'episode',slug:'bad-audio-episode',title:'قسمت آزمایشی پادکست',summary:'توضیح کافی برای قسمت آزمایشی پادکست جهت اعتبارسنجی.',status:'draft',payload:{description:'شرحی به اندازهٔ کافی طولانی برای این قسمت آزمایشی.',publishedAt:'2026-10-28',durationMinutes:20,audioUrl:'http://example.com/audio.mp3'}};
  const res=await worker.fetch(req('/api/admin/media',{method:'POST',body:bad,cookie}),env);
  assert.equal(res.status,422); assert.equal((await res.json()).error,'VALIDATION_FAILED');
});

test('نقش‌های مدیر رسانه و مدیر آکادمی از هم تفکیک شده‌اند', { skip }, async () => {
  const media = await setup('media_editor');
  assert.equal((await worker.fetch(req('/api/admin/media', { cookie: media.cookie }), media.env)).status, 200);
  assert.equal((await worker.fetch(req('/api/admin/content', { cookie: media.cookie }), media.env)).status, 403);
  const academy = await setup('academy_manager');
  assert.equal((await worker.fetch(req('/api/admin/content', { cookie: academy.cookie }), academy.env)).status, 200);
  assert.equal((await worker.fetch(req('/api/admin/media', { cookie: academy.cookie }), academy.env)).status, 403);
});
