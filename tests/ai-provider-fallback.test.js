import test from 'node:test';
import assert from 'node:assert/strict';
import { generateText } from '../worker/src/ai/gemini.js';
import { generateTextWithFallback } from '../worker/src/ai/fallback.js';

const env = { GEMINI_API_KEY: 'test-key-123456789', GEMINI_TEXT_MODEL: 'gemini-2.5-flash' };
const input = { system: 'system', contents: [{ role: 'user', parts: [{ text: 'hello' }] }] };
const success = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: 'پاسخ آزمایشی' }] } }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

test('retries a provider 5xx once with the fallback model', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return urls.length === 1
      ? new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 500 })
      : success();
  };
  try {
    const result = await generateText(env, input);
    assert.equal(result.text, 'پاسخ آزمایشی');
    assert.equal(urls.length, 2);
    assert.match(urls[0], /gemini-2\.5-flash/);
    assert.match(urls[1], /gemini-3\.5-flash-lite/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not retry quota errors', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
  };
  try {
    await assert.rejects(generateText(env, input), (error) => error.code === 'AI_QUOTA');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not retry rejected API keys or access errors', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 });
  };
  try {
    await assert.rejects(generateText(env, input), (error) => error.code === 'AI_KEY_REJECTED');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('uses a distinct fallback when Gemini 3.5 Flash-Lite is primary', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  const envPrimary = { ...env, GEMINI_TEXT_MODEL: 'gemini-3.5-flash-lite' };
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return urls.length === 1
      ? new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 503 })
      : success();
  };
  try {
    const result = await generateText(envPrimary, input);
    assert.equal(result.text, 'پاسخ آزمایشی');
    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes('gemini-3.5-flash-lite'));
    assert.ok(urls[1].includes('gemini-3.8-flash'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('never promotes Groq to a generation fallback, even when the legacy flag is passed', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 503 });
  };
  try {
    await assert.rejects(
      generateTextWithFallback(env, input, { allowGroq: true }),
      (error) => error.code === 'AI_PROVIDER_ERROR',
    );
    assert.equal(urls.length, 2);
    assert.ok(urls.every((url) => url.includes('generativelanguage.googleapis.com')));
    assert.ok(urls.some((url) => url.includes('gemini-2.5-flash')));
    assert.ok(urls.some((url) => url.includes('gemini-3.5-flash-lite')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
