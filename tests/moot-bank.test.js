import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { suggestCases } from '../worker/src/moot/suggest.js';
import { createTestDb } from './helpers/d1-sqlite.js';
import batch01 from '../worker/src/moot/bank/batch-01.js';

// پرونده‌های زیر فقط برای آزمون مسیرهای خواندن و چرخش در پایگاه داده قرار می‌گیرند.
// محتوای آموزشی تأییدشده نیستند و هیچ استنادی به‌عنوان تأییدشده ثبت نمی‌شود.
const FIXTURES = batch01.slice(0, 6);

function summaryLike(c, i) {
  return { id: c.id, title: c.title, area: c.area, difficulty: c.difficulty, summary: c.subject, subject: c.subject, issueCount: c.issues.length, level: c.difficulty, _i: i };
}

async function setup({ publish = FIXTURES } = {}) {
  const db = createTestDb();
  const admin = db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('admin@example.com','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  for (const c of publish) {
    db.raw.prepare("INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by) VALUES ('case', ?, ?, ?, 'published', ?, ?)")
      .run(c.id, c.title, c.subject.padEnd(12, '.').slice(0, 300), JSON.stringify(c), admin.id);
  }
  // پیش‌نویس‌ها هرگز نباید دیده شوند.
  const draft = batch01[batch01.length - 1];
  db.raw.prepare("INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by) VALUES ('case', ?, ?, ?, 'draft', ?, ?)")
    .run(draft.id, draft.title, draft.subject.padEnd(12, '.').slice(0, 300), JSON.stringify(draft), admin.id);
  const user = db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('student@example.com','h','دانشجو','2026-01-01T00:00:00Z') RETURNING id").get();
  const token = 'bank-test-session-token-123456';
  db.raw.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: db }, cookie: `wefagh_session=${token}`, userId: user.id, draft };
}

function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new Request(`https://wefagh.ir${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

// ---------- پیشنهاد چرخشی (تابع خالص) ----------

test('پرونده‌های دیده‌نشده پیش از پرونده‌های تمرین‌شده می‌آیند', () => {
  const cases = [0, 1, 2, 3].map((i) => summaryLike({ ...FIXTURES[i], area: `حوزه ${i}` }, i));
  const now = Date.parse('2026-10-30T12:00:00Z');
  const history = [{ case_slug: cases[0].id, views: 3, completions: 1, last_seen_at: '2026-10-30T11:00:00Z' }];
  const out = suggestCases(cases, history, { count: 4, now, random: () => 0 });
  assert.equal(out[out.length - 1].id, cases[0].id, 'تکمیل‌شده آخر می‌آید');
  assert.equal(out[0].reason, 'جدید');
});

test('پیشنهاد حوزه‌های متفاوت را ترجیح می‌دهد', () => {
  const cases = [
    { id: 'a-one-001', area: 'حوزه الف', difficulty: 'basic' },
    { id: 'a-two-002', area: 'حوزه الف', difficulty: 'basic' },
    { id: 'b-one-003', area: 'حوزه ب', difficulty: 'medium' },
    { id: 'c-one-004', area: 'حوزه ج', difficulty: 'advanced' },
  ];
  const out = suggestCases(cases, [], { count: 3, random: () => 0 });
  assert.equal(new Set(out.map((c) => c.area)).size, 3);
});

function seeded(seed) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; };
}

test('با بذر تصادفی متفاوت ترتیب پیشنهاد تغییر می‌کند؛ با بذر یکسان ثابت است', () => {
  const cases = FIXTURES.map((c, i) => summaryLike(c, i));
  const run = (seed) => suggestCases(cases, [], { count: 6, random: seeded(seed) }).map((c) => c.id).join();
  assert.equal(run(7), run(7));
  assert.notEqual(run(7), run(8));
});

// ---------- مسیرهای واقعی روی SQLite ----------

test('فهرست فقط پرونده‌های منتشرشده را دارد و فیلتر حوزه و سطح کار می‌کند', async () => {
  const { env } = await setup();
  const all = await (await worker.fetch(req('/api/moot/cases'), env)).json();
  assert.equal(all.total, FIXTURES.length);
  assert.ok(!all.cases.some((c) => c.id === batch01[batch01.length - 1].id), 'پیش‌نویس نباید دیده شود');
  const area = FIXTURES[0].area;
  const byArea = await (await worker.fetch(req(`/api/moot/cases?area=${encodeURIComponent(area)}`), env)).json();
  assert.ok(byArea.cases.every((c) => c.area === area));
  const q = await (await worker.fetch(req(`/api/moot/cases?q=${encodeURIComponent(FIXTURES[1].title)}`), env)).json();
  assert.ok(q.cases.some((c) => c.id === FIXTURES[1].id));
  const bad = await worker.fetch(req('/api/moot/cases?area=ناشناخته'), env);
  assert.equal(bad.status, 422);
});

test('جزئیات عمومی بخش‌های داوری را ندارد و پرونده پیش‌نویس ۴۰۴ است', async () => {
  const { env } = await setup();
  const res = await worker.fetch(req(`/api/moot/cases/${FIXTURES[0].id}`), env);
  assert.equal(res.status, 200);
  const { case: c } = await res.json();
  assert.equal(c.subject, FIXTURES[0].subject);
  for (const hidden of ['judge_questions', 'verdict', 'strengths_weaknesses', 'defense_scenarios']) assert.ok(!(hidden in c), hidden);
  assert.equal((await worker.fetch(req(`/api/moot/cases/${batch01[batch01.length - 1].id}`), env)).status, 404);
  assert.equal((await worker.fetch(req('/api/moot/cases/Not_Valid'), env)).status, 404);
});

test('انتخاب و تکمیل پرونده نیازمند ورود است و سوابق کاربر را به‌روز می‌کند', async () => {
  const { env, cookie, db } = await setup();
  const slug = FIXTURES[2].id;
  assert.equal((await worker.fetch(req(`/api/moot/cases/${slug}/select`, { method: 'POST' }), env)).status, 401);
  assert.equal((await worker.fetch(req(`/api/moot/cases/${slug}/select`, { method: 'POST', cookie }), env)).status, 200);
  assert.equal((await worker.fetch(req(`/api/moot/cases/${slug}/select`, { method: 'POST', cookie }), env)).status, 200);
  assert.equal((await worker.fetch(req(`/api/moot/cases/${slug}/complete`, { method: 'POST', cookie }), env)).status, 200);
  const row = db.raw.prepare('SELECT views, selections, completions FROM moot_case_history WHERE case_slug = ?').get(slug);
  assert.deepEqual({ ...row }, { views: 2, selections: 2, completions: 1 });
  const list = await (await worker.fetch(req('/api/moot/history', { cookie }), env)).json();
  assert.equal(list.history[0].case_slug, slug);
  assert.equal((await worker.fetch(req(`/api/moot/cases/${batch01[batch01.length - 1].id}/select`, { method: 'POST', cookie }), env)).status, 404);
});

test('پیشنهاد شخصی پرونده‌های تمرین‌شده را پایین‌تر می‌برد', async () => {
  const { env, cookie } = await setup();
  const seen = FIXTURES[0].id;
  await worker.fetch(req(`/api/moot/cases/${seen}/complete`, { method: 'POST', cookie }), env);
  const out = await (await worker.fetch(req('/api/moot/cases/suggest?count=6', { cookie }), env)).json();
  assert.equal(out.personal, true);
  assert.equal(out.cases[out.cases.length - 1].id, seen);
  const anon = await (await worker.fetch(req('/api/moot/cases/suggest?count=6'), env)).json();
  assert.equal(anon.personal, false);
  assert.ok(anon.cases.length >= 1);
});

test('پیشنهاد و فهرست بدون پایگاه داده ۵۰۳ می‌دهند', async () => {
  const res = await worker.fetch(req('/api/moot/cases'), {});
  assert.equal(res.status, 503);
});

test('پرونده‌ای که منتشر نشده به هوش مصنوعی نمی‌رسد و پاسخ ۴۰۴ است', async () => {
  const { env, cookie } = await setup();
  const draftId = batch01[batch01.length - 1].id;
  const res = await worker.fetch(req('/api/ai/moot/turn', { method: 'POST', body: { caseId: draftId, role: 'judge', history: [] }, cookie }), { ...env, GEMINI_API_KEY: 'x'.repeat(20) });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'CASE_NOT_AVAILABLE');
});
