import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
const skip = !DatabaseSync && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (name) => readFileSync(join(here, '..', 'worker', 'migrations', name), 'utf8');

function d1Like(db) {
  return { prepare(sql) {
    const stmt = db.prepare(sql.replace(/\\?\\d+/g, '?'));
    return {
      all: async (...args) => ({ results: stmt.all(...args) }),
      first: async (...args) => stmt.get(...args) ?? null,
      run: async (...args) => { stmt.run(...args); return { success: true }; },
      bind(...args) { return {
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => { stmt.run(...args); return { success: true }; },
      }; },
    };
  } };
}

async function setup(role = 'super_admin') {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0018_access_settings.sql'));
  const user = db.prepare("INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('admin@example.com','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  if (role) db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(user.id, role);
  const token = 'access-settings-session-token';
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: d1Like(db) }, cookie: `wefagh_session=${token}` };
}

function req(path, { method = 'GET', body, cookie, ip = '198.51.100.21' } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new Request(`https://mokhtari.ir${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('تنظیم عمومی ثبت‌نام پیش‌فرض خاموش است و مقدار ذخیره‌شده را نشان می‌دهد', { skip }, async () => {
  const { env } = await setup();
  let response = await worker.fetch(req('/api/access-settings'), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).registrationRequired, false);
  await env.DB.prepare("UPDATE app_settings SET setting_value = 'true' WHERE setting_key = 'registration_required'").run();
  response = await worker.fetch(req('/api/access-settings'), env);
  assert.equal((await response.json()).registrationRequired, true);
});

test('فقط مدیر می‌تواند الزام ثبت‌نام را تغییر دهد', { skip }, async () => {
  const { env, cookie } = await setup();
  assert.equal((await worker.fetch(req('/api/admin/settings/access', { method: 'PUT', body: { registrationRequired: true } }), env)).status, 401);
  const ordinary = await setup('user');
  assert.equal((await worker.fetch(req('/api/admin/settings/access', { method: 'PUT', body: { registrationRequired: true }, cookie: ordinary.cookie }), ordinary.env)).status, 403);
  const saved = await worker.fetch(req('/api/admin/settings/access', { method: 'PUT', body: { registrationRequired: true }, cookie }), env);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).registrationRequired, true);
  assert.equal((await worker.fetch(req('/api/access-settings'), env)).json instanceof Function, true);
  const invalid = await worker.fetch(req('/api/admin/settings/access', { method: 'PUT', body: { registrationRequired: 'false' }, cookie }), env);
  assert.equal(invalid.status, 422);
});

test('دستیار وکیل بدون ورود فقط در حالت دسترسی مهمان فعال است؛ اطلاعات شخصی همچنان محصور است', { skip }, async () => {
  const { env } = await setup();
  let response = await worker.fetch(req('/api/ai/assistant', { method: 'POST', body: { mode: 'consult', message: 'پرسش حقوقی آزمایشی' }, ip: '198.51.100.31' }), env);
  assert.equal(response.status, 503, 'در حالت مهمان باید از گیت ورود عبور کند و به بررسی پیکربندی هوش مصنوعی برسد');
  assert.equal((await response.json()).error, 'AI_NOT_CONFIGURED');
  response = await worker.fetch(req('/api/dashboard/summary'), env);
  assert.equal(response.status, 401);
  await env.DB.prepare("UPDATE app_settings SET setting_value = 'true' WHERE setting_key = 'registration_required'").run();
  response = await worker.fetch(req('/api/ai/assistant', { method: 'POST', body: { mode: 'consult', message: 'پرسش حقوقی آزمایشی' }, ip: '198.51.100.32' }), env);
  assert.equal(response.status, 401);
});
