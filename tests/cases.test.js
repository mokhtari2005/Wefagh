import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { CASES } from '../worker/src/cases/catalog.js';

let DatabaseSync;
let sqliteAvailable = true;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { sqliteAvailable = false; }
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');
function d1Like(db) {
  return { prepare(sql) {
    const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
    return { bind(...args) { return {
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({ success: true, results: stmt.all(...args) }),
      run: async () => { stmt.run(...args); return { success: true, results: [] }; },
    }; } };
  } };
}
async function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of ['0001_init.sql', '0002_auth.sql', '0003_academy.sql', '0004_deadlines.sql', '0005_casework.sql']) db.exec(migration(f));
  const user = db.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('case@example.com','h','دانشجو','2026-01-01T00:00:00Z') RETURNING id").get();
  const token = 'case-test-session-token-123456';
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: d1Like(db) }, cookie: `wefagh_session=${token}` };
}
function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {}; if (body !== undefined) headers['content-type'] = 'application/json'; if (cookie) headers.cookie = cookie;
  return new Request(`https://wefagh.ir${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

test('فهرست بانک پرونده‌ها فقط خلاصه را نشان می‌دهد و جزئیات برای شناسهٔ معتبر موجود است', async () => {
  const list = await worker.fetch(req('/api/cases'), {});
  assert.equal(list.status, 200);
  const body = await list.json();
  assert.equal(body.total, CASES.length);
  assert.ok(body.cases.every((c) => !('facts' in c) && c.issueCount > 0));
  const detail = await worker.fetch(req(`/api/cases/${CASES[0].id}`), {});
  assert.equal(detail.status, 200);
  assert.ok((await detail.json()).case.facts.length > 0);
  assert.equal((await worker.fetch(req('/api/cases/not-real'), {})).status, 404);
});

test('ذخیرهٔ تمرین نیازمند ورود است و داده‌ها پس از ایجاد قابل بازیابی و ویرایش‌اند', { skip }, async () => {
  const data = { caseId: CASES[0].id, title: 'تمرین اول', answers: { 'proof-delay': 'تحلیل کوتاه آموزشی' }, rubric: [true, false], stage: 'answers', score: 50 };
  assert.equal((await worker.fetch(req('/api/moot/sessions', { method: 'POST', body: data }), { DB: (await setup()).env.DB })).status, 401);
  const { env, cookie } = await setup();
  const created = await worker.fetch(req('/api/moot/sessions', { method: 'POST', body: data, cookie }), env);
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  const read = await worker.fetch(req(`/api/moot/sessions/${id}`, { cookie }), env);
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).session.answers, data.answers);
  const patched = await worker.fetch(req(`/api/moot/sessions/${id}`, { method: 'PATCH', body: { stage: 'result', score: 75 }, cookie }), env);
  assert.equal(patched.status, 200);
  const updated = await (await worker.fetch(req(`/api/moot/sessions/${id}`, { cookie }), env)).json();
  assert.equal(updated.session.stage, 'result');
  assert.equal(updated.session.score, 75);
  const list = await (await worker.fetch(req('/api/moot/sessions', { cookie }), env)).json();
  assert.equal(list.sessions.length, 1);
});

test('اعتبارسنجی ذخیرهٔ تمرین و جداسازی مالک رعایت می‌شود', { skip }, async () => {
  const { env, cookie } = await setup();
  const invalid = await worker.fetch(req('/api/moot/sessions', { method: 'POST', body: { caseId: 'bad', title: 'x', answers: {}, rubric: [], stage: 'unknown' }, cookie }), env);
  assert.equal(invalid.status, 422);
  const made = await worker.fetch(req('/api/moot/sessions', { method: 'POST', body: { caseId: CASES[0].id, title: 'تمرین مالک', answers: {}, rubric: [], stage: 'facts' }, cookie }), env);
  const id = (await made.json()).id;
  const foreign = await worker.fetch(req(`/api/moot/sessions/${id}`, { cookie: 'wefagh_session=wrong-token' }), env);
  assert.equal(foreign.status, 401);
});
