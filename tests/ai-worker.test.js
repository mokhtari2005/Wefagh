import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { AiError, extractText, generateText, synthesizeSpeech, aiConfigured, modelIds } from '../worker/src/ai/gemini.js';
import { cleanHistory, rateLimited, LIMITS } from '../worker/src/ai/routes.js';
import { MOOT_CASES, mootSystemPrompt, assistantSystemPrompt, LEGAL_DISCLAIMER } from '../worker/src/ai/prompts.js';

const KEY = 'AIzaSyTESTKEY-0123456789';
const BASE = 'https://wefagh.ir';

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return impl(String(url), init);
  };
  return fn(calls).finally(() => { globalThis.fetch = original; });
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// D1 ساختگی: نشست معتبر یا بدون نشست.
function fakeDb({ loggedIn = false } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => (sql.includes('FROM sessions') && loggedIn ? { id: 7, email: 'u@example.com', display_name: 'کاربر' } : null),
            all: async () => ({ results: loggedIn ? [{ role: 'user' }] : [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
}

function req(path, { method = 'POST', body, cookie = null, type = 'application/json' } = {}) {
  const headers = {};
  if (type) headers['content-type'] = type;
  if (cookie) headers.cookie = `wefagh_session=${cookie}`;
  return new Request(BASE + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
}

test('کلید API فقط از Secret خوانده می‌شود و وضعیت آن هرگز کلید را نشان نمی‌دهد', async () => {
  assert.equal(aiConfigured({}), false);
  assert.equal(aiConfigured({ GEMINI_API_KEY: 'short' }), false);
  assert.equal(aiConfigured({ GEMINI_API_KEY: KEY }), true);
  const res = await worker.fetch(req('/api/ai/status', { method: 'GET' }), { GEMINI_API_KEY: KEY });
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(text.includes('"configured":true'));
  assert.ok(!text.includes(KEY));
});

test('بدون کلید هیچ درخواستی به Gemini ارسال نمی‌شود', async () => {
  await withFetch(async () => { throw new Error('نباید فراخوانی شود'); }, async (calls) => {
    await assert.rejects(() => generateText({}, { system: 's', contents: [] }), (e) => e instanceof AiError && e.code === 'AI_NOT_CONFIGURED' && e.status === 503);
    assert.equal(calls.length, 0);
  });
});

test('کلید در هدر می‌رود، نه در آدرس، و در پیام خطا نمی‌آید', async () => {
  await withFetch(async () => jsonRes(403, { error: { message: `key ${KEY} denied` } }), async (calls) => {
    const env = { GEMINI_API_KEY: KEY };
    await assert.rejects(() => generateText(env, { system: 's', contents: [{ role: 'user', parts: [{ text: 'سلام' }] }] }), (e) => {
      assert.equal(e.code, 'AI_KEY_REJECTED');
      assert.ok(!String(e.message).includes(KEY));
      return true;
    });
    assert.ok(!calls[0].url.includes(KEY));
    assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
    assert.ok(calls[0].url.includes(`models/${modelIds(env).text}:generateContent`));
  });
});

test('خطاهای API به کدهای امن و وضعیت مناسب نگاشت می‌شوند', async () => {
  const cases = [[429, 'AI_QUOTA', 429], [500, 'AI_UNAVAILABLE', 503], [400, 'AI_REJECTED', 502]];
  for (const [upstream, code, status] of cases) {
    await withFetch(async () => jsonRes(upstream, {}), async () => {
      await assert.rejects(() => generateText({ GEMINI_API_KEY: KEY }, { system: 's', contents: [] }), (e) => e.code === code && e.status === status);
    });
  }
  await withFetch(async () => { throw new TypeError('network down'); }, async () => {
    await assert.rejects(() => generateText({ GEMINI_API_KEY: KEY }, { system: 's', contents: [] }), (e) => e.code === 'AI_UNAVAILABLE');
  });
});

test('متن خالی یا بلاک‌شده خطای مشخص می‌دهد', () => {
  assert.equal(extractText({ candidates: [{ content: { parts: [{ text: ' سلام ' }] } }] }), 'سلام');
  assert.throws(() => extractText({ candidates: [] }), (e) => e.code === 'AI_EMPTY');
  assert.throws(() => extractText({ promptFeedback: { blockReason: 'SAFETY' } }), (e) => e.code === 'AI_BLOCKED');
});

test('صدا از پاسخ Interactions استخراج و به بایت تبدیل می‌شود', async () => {
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6]).toString('base64');
  const body = { steps: [{ type: 'model_output', content: [{ type: 'audio', data: pcm }] }] };
  await withFetch(async () => jsonRes(200, body), async (calls) => {
    const out = await synthesizeSpeech({ GEMINI_API_KEY: KEY }, 'متن آزمایشی');
    assert.deepEqual([...out.bytes], [1, 2, 3, 4, 5, 6]);
    assert.equal(out.mimeType, 'audio/wav');
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.response_format.type, 'audio');
  });
});

test('سابقهٔ گفت‌وگو: نقش نامعتبر و سقف تعداد و طول رد می‌شود', () => {
  assert.equal(cleanHistory(undefined).length, 0);
  assert.equal(cleanHistory([{ role: 'system', text: 'x' }]), null);
  assert.equal(cleanHistory(Array.from({ length: LIMITS.historyItems + 1 }, () => ({ role: 'user', text: 'ا' }))), null);
  assert.equal(cleanHistory([{ role: 'user', text: 'a'.repeat(LIMITS.turnChars + 1) }]), null);
  assert.equal(cleanHistory([{ role: 'ai', text: 'پاسخ' }]).length, 1);
});

test('محدودکنندهٔ نرخ هر کاربر بعد از سقف درخواست را می‌بندد', () => {
  const id = 'rate-test-' + Math.random();
  const now = 1_000_000;
  for (let i = 0; i < LIMITS.callsPerMinute; i++) assert.equal(rateLimited(id, now), false);
  assert.equal(rateLimited(id, now), true);
  assert.equal(rateLimited(id, now + 61_000), false);
});

test('مسیرهای هوش مصنوعی بدون ورود رد می‌شوند', async () => {
  for (const path of ['/api/ai/moot/turn', '/api/ai/assistant', '/api/ai/speech', '/api/ai/transcribe']) {
    const res = await worker.fetch(req(path, { body: { caseId: 'contract-delivery-delay' } }), { DB: fakeDb(), GEMINI_API_KEY: KEY });
    assert.equal(res.status, 401, path);
  }
});

test('ورودی نامعتبر پس از ورود با ۴۲۲ رد می‌شود و بدون فراخوانی Gemini', async () => {
  await withFetch(async () => { throw new Error('نباید فراخوانی شود'); }, async (calls) => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const cookie = 'tok';
    const bad = await worker.fetch(req('/api/ai/moot/turn', { body: { caseId: 'unknown', role: 'judge', history: [] }, cookie }), env);
    assert.equal(bad.status, 422);
    const noDoc = await worker.fetch(req('/api/ai/assistant', { body: { mode: 'draft', message: 'سلام', history: [] }, cookie }), env);
    assert.equal(noDoc.status, 422);
    const badMime = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'application/x-msdownload', data: 'AAAA' }, cookie }), env);
    assert.equal(badMime.status, 422);
    const tooBig = await worker.fetch(req('/api/ai/speech', { body: { text: 'ا'.repeat(LIMITS.speechChars + 1) }, cookie }), env);
    assert.equal(tooBig.status, 422);
    assert.equal(calls.length, 0);
  });
});

test('پرونده و دستور سیستمی روی سرور است و پیام کاربر نمی‌تواند نقش را عوض کند', () => {
  const prompt = mootSystemPrompt({ role: 'opposing', caseId: 'contract-delivery-delay', difficulty: 'advanced' });
  assert.ok(prompt.includes('وکیل طرف مقابل'));
  assert.ok(prompt.includes(MOOT_CASES['contract-delivery-delay'].facts[0]));
  assert.ok(prompt.includes('نادیده بگیر'));
  const asst = assistantSystemPrompt({ mode: 'draft', docType: 'petition' });
  assert.ok(asst.includes('دادخواست'));
  assert.ok(asst.includes('[جای خالی'));
  assert.ok(LEGAL_DISCLAIMER.includes('جایگزین بررسی حرفه‌ای وکیل نیست'));
});

test('مسیر دستیار از ورود تا پاسخ ساخت‌یافته (با Gemini ساختگی) کامل کار می‌کند', async () => {
  const modelJson = { status: 'ready', questions: [], text: 'پیش‌نویس آزمایشی [جای خالی: نام موکل]', notes: ['بررسی شود'] };
  await withFetch(async (url, init) => {
    assert.ok(url.includes('generativelanguage.googleapis.com'));
    assert.ok(!url.includes(KEY));
    const sent = JSON.parse(init.body);
    assert.equal(sent.generationConfig.responseMimeType, 'application/json');
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
  }, async () => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', { body: { mode: 'draft', docType: 'petition', message: 'موضوع: مطالبه خسارت', history: [] }, cookie: 'tok' }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.status, 'ready');
    assert.match(data.text, /جای خالی/);
    assert.equal(data.disclaimer, LEGAL_DISCLAIMER);
    assert.ok(!JSON.stringify(data).includes(KEY));
  });
});
