import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTextWithFallback } from '../worker/src/ai/fallback.js';

const env = { GEMINI_API_KEY: 'test-gemini-key-1234567890', GEMINI_TEXT_MODEL: 'gemini-3.5-flash-lite', GROQ_API_KEY: 'gsk_test_key_for_unit_tests_1234567890' };
const prompt = {
  system: 'دستیار حقوقی',
  contents: [{ role: 'user', parts: [{ text: 'یک پاسخ آزمایشی بده.' }] }],
  maxOutputTokens: 1200,
  timeoutMs: 20_000,
  fallbackTimeoutMs: 12_000,
  json: true,
  schema: { type: 'OBJECT' },
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function silenceLogs(t) {
  const info = console.info;
  const error = console.error;
  console.info = () => {};
  console.error = () => {};
  t.after(() => {
    console.info = info;
    console.error = error;
  });
}

test('Gemini timeout and fallback-model 503 route a text-only request to Groq', async (t) => {
  silenceLogs(t);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) throw new TypeError('network timeout');
    if (calls.length === 2) return jsonResponse({ error: { status: 'UNAVAILABLE' } }, 503);
    return jsonResponse({
      choices: [{ message: { content: JSON.stringify({ status: 'ready', questions: [], notes: [], text: 'پاسخ آزمایشی' }) } }],
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await generateTextWithFallback(env, prompt, { allowGroq: true });

  assert.equal(result.provider, 'groq');
  assert.equal(result.data.text, 'پاسخ آزمایشی');
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /gemini-3\.5-flash-lite/);
  assert.match(calls[1].url, /gemini-3\.8-flash/);
  assert.match(calls[2].url, /api\.groq\.com/);
});

test('Groq fallback is not used when attachments are present', async (t) => {
  silenceLogs(t);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) throw new TypeError('network timeout');
    return jsonResponse({ error: { status: 'UNAVAILABLE' } }, 503);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    generateTextWithFallback(env, {
      ...prompt,
      contents: [{ role: 'user', parts: [{ text: 'متن' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
    }, { allowGroq: false }),
    (error) => error?.code === 'AI_PROVIDER_ERROR',
  );

  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => !url.includes('api.groq.com')));
});

test('Groq 429 retries the 20B model after the 120B model', async (t) => {
  silenceLogs(t);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    if (calls.length === 1) throw new TypeError('network timeout');
    if (calls.length === 2) return jsonResponse({ error: { status: 'UNAVAILABLE' } }, 503);
    if (calls.length === 3) return jsonResponse({ error: { message: 'rate limit' } }, 429);
    return jsonResponse({
      choices: [{ message: { content: JSON.stringify({ status: 'ready', questions: [], notes: [], text: 'پاسخ مدل پشتیبان' }) } }],
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await generateTextWithFallback(env, prompt, { allowGroq: true });

  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.equal(calls.length, 4);
  assert.equal(calls[2].body.model, 'openai/gpt-oss-120b');
  assert.equal(calls[3].body.model, 'openai/gpt-oss-20b');
});

test('failed Groq failover is recorded without hiding the original Gemini error', async (t) => {
  silenceLogs(t);
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count += 1;
    if (count === 1) throw new TypeError('network timeout');
    if (count === 2) return jsonResponse({ error: { status: 'UNAVAILABLE' } }, 503);
    return jsonResponse({ error: { message: 'provider unavailable' } }, 503);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    generateTextWithFallback(env, prompt, { allowGroq: true }),
    (error) => {
      assert.equal(error.code, 'AI_PROVIDER_ERROR');
      assert.equal(error.details.fallbackProvider, 'groq');
      assert.equal(error.details.fallbackCode, 'GROQ_PROVIDER_ERROR');
      assert.equal(error.details.fallbackStatus, 503);
      return true;
    },
  );
  assert.equal(count, 3); // دو تلاش Gemini و یک تلاش ناموفق با مدل اصلی Groq.
});
