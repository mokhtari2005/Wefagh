import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTextWithFallback } from '../worker/src/ai/fallback.js';

const env = {
  OPENAI_API_KEY: 'sk-test-openai-key-123456789012345',
  OPENAI_TEXT_MODEL: 'gpt-6.2-astra',
  GEMINI_API_KEY: 'test-gemini-key-123456',
  GEMINI_TEXT_MODEL: 'gemini-3.5-flash-lite',
  GROQ_API_KEY: 'gsk_test_key_12345678901234567890',
};

const prompt = {
  system: 'دستیار حقوقی فارسی هستی.',
  contents: [{ role: 'user', parts: [{ text: 'پرسش حقوقی آزمایشی' }] }],
  maxOutputTokens: 1000,
  json: true,
};

function openaiSuccess() {
  return new Response(JSON.stringify({
    choices: [{ message: { content: '{"status":"ready","questions":[],"notes":[],"text":"پاسخ GPT"}' }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function geminiSuccess(text = '{"status":"ready","questions":[],"notes":[],"text":"پاسخ Gemini"}') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('uses GPT as the primary text model when its key is configured', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return openaiSuccess();
  };
  try {
    const result = await generateTextWithFallback(env, prompt);
    assert.equal(result.provider, 'openai');
    assert.equal(result.data.text, 'پاسخ GPT');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.openai\.com\/v1\/chat\/completions/u);
    assert.equal(calls[0].body.model, 'gpt-6.2-astra');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back from a GPT provider failure to Gemini', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (calls.length === 1) return new Response('{}', { status: 503 });
    return geminiSuccess();
  };
  try {
    const result = await generateTextWithFallback(env, prompt);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.fallbackFrom, 'openai');
    assert.equal(result.data.text, 'پاسخ Gemini');
    assert.equal(calls.length, 2);
    assert.match(calls[0], /api\.openai\.com/u);
    assert.match(calls[1], /generativelanguage\.googleapis\.com/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses Groq only after both GPT and Gemini generation paths fail', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (calls.length <= 3) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"status":"ready","questions":[],"notes":[],"text":"پاسخ پشتیبان"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateTextWithFallback(env, prompt);
    assert.equal(result.provider, 'groq');
    assert.equal(result.data.text, 'پاسخ پشتیبان');
    assert.equal(calls.length, 4);
    assert.match(calls[0], /api\.openai\.com/u);
    assert.match(calls[1], /generativelanguage\.googleapis\.com/u);
    assert.match(calls[2], /generativelanguage\.googleapis\.com/u);
    assert.match(calls[3], /api\.groq\.com/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('routes file-bearing requests away from GPT and Groq to preserve the Gemini attachment path', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return geminiSuccess();
  };
  try {
    const result = await generateTextWithFallback(env, {
      ...prompt,
      contents: [{ role: 'user', parts: [{ text: 'سند پیوست' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
    }, { allowOpenAI: false, allowGroq: false });
    assert.equal(result.provider, 'gemini');
    assert.equal(result.fallbackFrom, 'attachments');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /generativelanguage\.googleapis\.com/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
