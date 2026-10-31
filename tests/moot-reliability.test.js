// تست یکپارچه: Worker واقعی + D1 واقعی (SQLite). فقط Gemini شبیه‌سازی شده است (fetch)، چون کلید واقعی در دسترس نیست.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { LIMITS } from '../worker/src/ai/routes.js';
import { createTestDb } from './helpers/d1-sqlite.js';
import batch01 from '../worker/src/moot/bank/batch-01.js';
import { makeWav } from './helpers/wav.js';

const KEY = 'AIzaSyTESTKEY-0123456789-SECRET';
const CASE = batch01[0];
const BASE = 'https://wefagh.ir';

async function setup() {
  const db = createTestDb();
  const admin = db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('a@example.com','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  db.raw.prepare("INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by) VALUES ('case', ?, ?, ?, 'published', ?, ?)")
    .run(CASE.id, CASE.title, CASE.subject.padEnd(12, '.').slice(0, 300), JSON.stringify(CASE), admin.id);
  const user = db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('s@example.com','h','دانشجو','2026-01-01T00:00:00Z') RETURNING id").get();
  const token = 'reliability-session-token-123456';
  db.raw.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: db, GEMINI_API_KEY: KEY }, cookie: `wefagh_session=${token}`, userId: user.id };
}

function post(path, body, cookie, raw = false) {
  return new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: raw ? body : JSON.stringify(body),
  });
}

async function withGemini(impl, fn) {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const calls = [];
  const logs = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null, init }); return impl(String(url), init, calls.length); };
  console.error = (...args) => logs.push(args.join(' '));
  try {
    return await fn({ calls, logs });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}

const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const audioReply = (wav) => jsonRes(200, { steps: [{ type: 'model_output', content: [{ type: 'audio', data: b64(wav) }] }] });

// ---------- ۱. لاگ امن ----------

test('خطای ۴۰۳ Gemini علت را فقط با کد شمارشی لاگ می‌کند، نه کلید، متن پرونده یا متن کاربر', async () => {
  const { env, cookie } = await setup();
  const secretText = 'متن-محرمانه-کاربر-۹۸۷۶';
  await withGemini(async () => jsonRes(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: `متن پرونده شما: ${secretText} و کلید ${KEY}` } }), async ({ logs }) => {
    const res = await worker.fetch(post('/api/ai/moot/turn', { caseId: CASE.id, role: 'judge', stage: 'claim', history: [{ role: 'user', speaker: 'plaintiff', text: secretText }] }, cookie), env);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'AI_KEY_REJECTED');
    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]);
    assert.deepEqual(entry, { where: 'gemini', op: 'text', model: 'gemini-2.5-flash', stage: 'http', httpStatus: 403, reason: 'PERMISSION_DENIED' });
    for (const bad of [KEY, 'AIzaSy', secretText, CASE.facts[0], 'متن پرونده شما']) assert.ok(!logs[0].includes(bad), `نباید در لاگ باشد: ${bad}`);
  });
});

test('کدهای ۴۰۴، ۴۲۹، ۴۰۰ و ۵۰۰ هر کدام به خطای مشخص نگاشت می‌شوند و لاگ دارند', async () => {
  const { env, cookie } = await setup();
  const cases = [[404, 'NOT_FOUND', 'AI_MODEL_UNAVAILABLE', 503], [429, 'RESOURCE_EXHAUSTED', 'AI_QUOTA', 429], [400, 'INVALID_ARGUMENT', 'AI_REJECTED', 502], [500, 'INTERNAL', 'AI_UNAVAILABLE', 503]];
  for (const [httpStatus, status, code, out] of cases) {
    await withGemini(async () => jsonRes(httpStatus, { error: { status, message: 'x' } }), async ({ logs }) => {
      const res = await worker.fetch(post('/api/ai/speech', { text: 'سلام' }, cookie), env);
      assert.equal(res.status, out, `HTTP ${httpStatus}`);
      assert.equal((await res.json()).error, code);
      const entry = JSON.parse(logs[0]);
      assert.equal(entry.op, 'speech');
      assert.equal(entry.model, 'gemini-3.8-flash-tts');
      assert.equal(entry.httpStatus, httpStatus);
      assert.equal(entry.reason, status);
    });
  }
});

test('مقدار غیرشمارشی در error.status هرگز لاگ نمی‌شود (احتمال تکرار ورودی کاربر)', async () => {
  const { env, cookie } = await setup();
  await withGemini(async () => jsonRes(400, { error: { status: 'متن آزاد کاربر که نباید لاگ شود' } }), async ({ logs }) => {
    await worker.fetch(post('/api/ai/speech', { text: 'سلام' }, cookie), env);
    const entry = JSON.parse(logs[0]);
    assert.equal(entry.reason, undefined);
    assert.ok(!logs[0].includes('کاربر'));
  });
});

test('پاسخ خالی یا قطع‌شده با MAX_TOKENS در لاگ finishReason دارد ولی متن مدل ندارد', async () => {
  const { env, cookie } = await setup();
  await withGemini(async () => jsonRes(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '  ' }] } }] }), async ({ logs }) => {
    const res = await worker.fetch(post('/api/ai/moot/turn', { caseId: CASE.id, role: 'judge', stage: 'claim', history: [] }, cookie), env);
    assert.equal((await res.json()).error, 'AI_EMPTY');
    assert.deepEqual(JSON.parse(logs[0]), { where: 'gemini', op: 'text', model: 'gemini-2.5-flash', stage: 'content', reason: 'AI_EMPTY', finishReason: 'MAX_TOKENS' });
  });
});

test('خطای شبکه لاگ می‌شود بدون جزئیات پیام استثنا', async () => {
  const { env, cookie } = await setup();
  await withGemini(async () => { throw Object.assign(new Error(`connect failed key=${KEY}`), { name: 'TypeError' }); }, async ({ logs }) => {
    const res = await worker.fetch(post('/api/ai/speech', { text: 'سلام' }, cookie), env);
    assert.equal((await res.json()).error, 'AI_UNAVAILABLE');
    assert.deepEqual(JSON.parse(logs[0]), { where: 'gemini', op: 'speech', model: 'gemini-3.8-flash-tts', stage: 'network', reason: 'TYPEERROR' });
    assert.ok(!logs[0].includes(KEY));
  });
});

// ---------- ۲. صدای بلند ----------

test('متن ۱۸۰۰ نویسه‌ای (بیش از سقف قبلی ۱۲۰۰) قبول می‌شود و چند تکه به یک WAV واحد تبدیل می‌شود', async () => {
  const { env, cookie } = await setup();
  const sentence = 'دادگاه ادعای خواهان را بر اساس مستندات پرونده بررسی می‌کند.';
  const text = Array.from({ length: 30 }, () => sentence).join(' ');
  assert.ok(text.length > 1200 && text.length <= LIMITS.speechChars, `طول ${text.length}`);
  await withGemini(async (url, init, n) => audioReply(makeWav([n * 10, n * 10 + 1])), async ({ calls }) => {
    const res = await worker.fetch(post('/api/ai/speech', { text, voice: 'Charon' }, cookie), env);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
    assert.ok(calls.length >= 2, `تعداد تماس ${calls.length}`);
    assert.ok(calls.every((c) => c.url.endsWith('/interactions') && c.body.model === 'gemini-3.8-flash-tts'));
    assert.ok(calls.every((c) => c.body.input[0].content[0].text.length <= 900));
    assert.equal(calls.map((c) => c.body.input[0].content[0].text).join(' '), text);
    const wav = new Uint8Array(await res.arrayBuffer());
    assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
    assert.equal(new DataView(wav.buffer).getUint32(40, true), calls.length * 4, 'هر تکه ۲ نمونهٔ ۱۶بیتی');
  });
});

test('متن کوتاه فقط یک تماس TTS می‌زند و بایت‌ها را بدون تغییر برمی‌گرداند', async () => {
  const { env, cookie } = await setup();
  const wav = makeWav([5, 6, 7]);
  await withGemini(async () => audioReply(wav), async ({ calls }) => {
    const res = await worker.fetch(post('/api/ai/speech', { text: 'سلام. جلسه آغاز می‌شود.' }, cookie), env);
    assert.equal(calls.length, 1);
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), wav);
  });
});

test('اگر یکی از تکه‌های TTS شکست بخورد، کل درخواست خطای مشخص می‌دهد (نه صدای ناقص)', async () => {
  const { env, cookie } = await setup();
  const text = Array.from({ length: 30 }, () => 'دادگاه ادعای خواهان را بر اساس مستندات پرونده بررسی می‌کند.').join(' ');
  await withGemini(async (url, init, n) => (n === 2 ? jsonRes(429, { error: { status: 'RESOURCE_EXHAUSTED' } }) : audioReply(makeWav([1]))), async () => {
    const res = await worker.fetch(post('/api/ai/speech', { text }, cookie), env);
    assert.equal(res.status, 429);
    assert.equal((await res.json()).error, 'AI_QUOTA');
  });
});

test('تکه‌های WAV با قالب نامتجانس صدای خراب نمی‌سازند و خطای AI_EMPTY می‌دهند', async () => {
  const { env, cookie } = await setup();
  const text = Array.from({ length: 30 }, () => 'دادگاه ادعای خواهان را بر اساس مستندات پرونده بررسی می‌کند.').join(' ');
  await withGemini(async (url, init, n) => audioReply(makeWav([1], { sampleRate: n === 1 ? 24000 : 16000 })), async ({ logs }) => {
    const res = await worker.fetch(post('/api/ai/speech', { text }, cookie), env);
    assert.equal((await res.json()).error, 'AI_EMPTY');
    assert.equal(JSON.parse(logs[0]).reason, 'WAV_MISMATCH');
  });
});

test('متن بیش از سقف جدید TTS همچنان ۴۲۲ می‌گیرد و Gemini صدا زده نمی‌شود', async () => {
  const { env, cookie } = await setup();
  await withGemini(async () => { throw new Error('نباید صدا زده شود'); }, async ({ calls }) => {
    const res = await worker.fetch(post('/api/ai/speech', { text: 'ا'.repeat(LIMITS.speechChars + 1) }, cookie), env);
    assert.equal(res.status, 422);
    assert.equal(calls.length, 0);
  });
});

test('پاسخ قاضی بلندتر از سقف نوبت در مرز جمله کوتاه می‌شود تا صدا و تاریخچهٔ بعدی رد نشوند', async () => {
  const { env, cookie } = await setup();
  const reply = `${'ب'.repeat(1500)}. ${'ج'.repeat(1500)}.`;
  await withGemini(async () => jsonRes(200, { candidates: [{ content: { parts: [{ text: reply }] } }] }), async () => {
    const res = await worker.fetch(post('/api/ai/moot/turn', { caseId: CASE.id, role: 'judge', stage: 'claim', history: [] }, cookie), env);
    const data = await res.json();
    assert.ok(data.reply.length <= LIMITS.turnChars);
    assert.ok(data.reply.endsWith('.'));
  });
});

// ---------- ۳. بدنهٔ بزرگ تاریخچه ----------

function longHistory(items, chars) {
  return Array.from({ length: items }, (_, i) => ({ role: i % 2 ? 'user' : 'ai', speaker: i % 2 ? 'plaintiff' : 'judge', text: 'ا'.repeat(chars) }));
}

test('تاریخچهٔ فارسی ۱۲۰۰۰ نویسه (بیش از ۱۶ کیلوبایت UTF-8) در moot/turn پذیرفته می‌شود', async () => {
  const { env, cookie } = await setup();
  const body = { caseId: CASE.id, role: 'defendant', stage: 'defense', history: longHistory(8, 1500) };
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 16 * 1024);
  await withGemini(async () => jsonRes(200, { candidates: [{ content: { parts: [{ text: 'پاسخ' }] } }] }), async ({ calls }) => {
    const res = await worker.fetch(post('/api/ai/moot/turn', body, cookie), env);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].body.contents[0].parts[0].text.includes('[قاضی]'), 'متن گفت‌وگو به مدل رسیده است');
  });
});

test('سقف‌های موجود تاریخچه بدون تغییر ماندند: ۴۰ آیتم و ۳۰۰۰۰ نویسه', async () => {
  const { env, cookie } = await setup();
  await withGemini(async () => { throw new Error('نباید صدا زده شود'); }, async ({ calls }) => {
    const tooMany = await worker.fetch(post('/api/ai/moot/turn', { caseId: CASE.id, role: 'judge', stage: 'claim', history: longHistory(41, 10) }, cookie), env);
    assert.equal(tooMany.status, 422);
    const tooLong = await worker.fetch(post('/api/ai/moot/turn', { caseId: CASE.id, role: 'judge', stage: 'claim', history: longHistory(16, 2000) }, cookie), env);
    assert.equal(tooLong.status, 422);
    assert.equal(calls.length, 0);
  });
});

test('بدنهٔ بیش از سقف moot با ۴۱۳ رد می‌شود و بدنهٔ نامعتبر JSON با ۴۰۰', async () => {
  const { env, cookie } = await setup();
  await withGemini(async () => { throw new Error('نباید صدا زده شود'); }, async ({ calls }) => {
    const huge = await worker.fetch(post('/api/ai/moot/turn', JSON.stringify({ caseId: CASE.id, role: 'judge', pad: 'x'.repeat(LIMITS.mootBodyBytes) }), cookie, true), env);
    assert.equal(huge.status, 413);
    const broken = await worker.fetch(post('/api/ai/moot/turn', '{not json', cookie, true), env);
    assert.equal(broken.status, 400);
    assert.equal(calls.length, 0);
  });
});

// ---------- ۵. ثبت تکمیل جلسه ----------

const historyRow = (db, userId) => db.raw.prepare('SELECT selections, completions FROM moot_case_history WHERE user_id = ? AND case_slug = ?').get(userId, CASE.id);

test('تکمیل جلسه در D1 ثبت می‌شود و برای کاربر بدون ورود ۴۰۱ است', async () => {
  const { db, env, cookie, userId } = await setup();
  const anon = await worker.fetch(new Request(`${BASE}/api/moot/cases/${CASE.id}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
  assert.equal(anon.status, 401);
  assert.equal(historyRow(db, userId), undefined);
  const ok = await worker.fetch(post(`/api/moot/cases/${CASE.id}/complete`, {}, cookie), env);
  assert.equal(ok.status, 200);
  assert.equal(historyRow(db, userId).completions, 1);
});

test('تکمیل جلسه برای پروندهٔ منتشرنشده ثبت نمی‌شود', async () => {
  const { db, env, cookie, userId } = await setup();
  const res = await worker.fetch(post('/api/moot/cases/no-such-case/complete', {}, cookie), env);
  assert.equal(res.status, 404);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM moot_case_history WHERE user_id = ?').get(userId).n, 0);
});
