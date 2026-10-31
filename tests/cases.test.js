import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import batch01 from '../worker/src/moot/bank/batch-01.js';
import { createTestDb } from './helpers/d1-sqlite.js';

// آزمون مسیر خواندن: پرونده‌های زیر مستقیم در جدول منتشرشده قرار می‌گیرند تا خواندن از پایگاه داده سنجیده شود.
// این داده‌ها محتوای آموزشی تأییدشده نیستند؛ گیت انتشار در مسیر نوشتن (admin) آزموده می‌شود.
const CASES = batch01.slice(0, 2).map((c) => ({ id: c.id, subject: c.subject }));

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
  const db = createTestDb();
  const admin = db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('admin@example.com','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  for (const c of batch01.slice(0, 2)) {
    db.raw.prepare("INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by) VALUES ('case', ?, ?, ?, 'published', ?, ?)")
      .run(c.id, c.title, c.subject.slice(0, 400).padEnd(10, '.'), JSON.stringify(c), admin.id);
  }
  const user = db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('case@example.com','h','دانشجو','2026-01-01T00:00:00Z') RETURNING id").get();
  const token = 'case-test-session-token-123456';
  db.raw.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: db }, cookie: `wefagh_session=${token}` };
}
function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {}; if (body !== undefined) headers['content-type'] = 'application/json'; if (cookie) headers.cookie = cookie;
  return new Request(`https://wefagh.ir${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

test('فهرست بانک پرونده‌ها فقط خلاصه را نشان می‌دهد و جزئیات عمومی بدون بخش‌های داوری است', async () => {
  const { env } = await setup();
  const list = await worker.fetch(req('/api/cases'), env);
  assert.equal(list.status, 200);
  const body = await list.json();
  assert.equal(body.total, CASES.length);
  assert.ok(body.cases.every((c) => !('facts' in c) && c.issueCount > 0));
  const detail = await worker.fetch(req(`/api/cases/${CASES[0].id}`), env);
  assert.equal(detail.status, 200);
  const item = (await detail.json()).case;
  assert.ok(item.facts.length > 0);
  assert.ok(!('judge_questions' in item) && !('verdict' in item) && !('strengths_weaknesses' in item));
  assert.equal((await worker.fetch(req('/api/cases/not-real'), env)).status, 404);
});

test('ذخیرهٔ تمرین نیازمند ورود است و داده‌ها پس از ایجاد قابل بازیابی و ویرایش‌اند', { skip }, async () => {
  const data = { caseId: CASES[0].id, title: 'تمرین اول', answers: { 'proof-delay': 'تحلیل کوتاه آموزشی' }, rubric: [true, false], stage: 'answers', score: 50 };
  assert.equal((await worker.fetch(req('/api/moot/sessions', { method: 'POST', body: data }), (await setup()).env)).status, 401);
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

test('فیلتر فهرست: حوزه، سطح و جست‌وجو اعتبارسنجی و اعمال می‌شوند', { skip }, async () => {
  const { env } = await setup();
  assert.equal((await worker.fetch(req('/api/cases?area=نامعتبر'), env)).status, 422);
  assert.equal((await worker.fetch(req('/api/cases?difficulty=expert'), env)).status, 422);
  assert.equal((await worker.fetch(req(`/api/cases?q=${'x'.repeat(101)}`), env)).status, 422);
  const all = await (await worker.fetch(req('/api/cases'), env)).json();
  const byArea = await (await worker.fetch(req(`/api/cases?area=${encodeURIComponent(all.cases[0].area)}`), env)).json();
  assert.ok(byArea.cases.length >= 1 && byArea.cases.every((c) => c.area === all.cases[0].area));
  const none = await (await worker.fetch(req('/api/cases?q=این-عبارت-وجود-ندارد'), env)).json();
  assert.equal(none.total, 0);
  const hit = await (await worker.fetch(req(`/api/cases?q=${encodeURIComponent(all.cases[0].title.slice(0, 6))}`), env)).json();
  assert.ok(hit.cases.some((c) => c.id === all.cases[0].id));
});

test('جزئیات عمومی: استناد بررسی‌نشده بدون شمارهٔ ماده است و طرفین و ادعاها نمایش داده می‌شوند', { skip }, async () => {
  const { env } = await setup();
  const detail = await (await worker.fetch(req(`/api/cases/${batch01[0].id}`), env)).json();
  assert.ok(detail.case.claims.plaintiff.length > 0);
  assert.ok(detail.case.legalRefs.length > 0);
  assert.ok(detail.case.legalRefs.every((r) => r.article === null && r.status === 'needs_review'));
});
