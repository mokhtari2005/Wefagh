import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateText, AiError, AI_TIMEOUT_MS } from '../worker/src/ai/gemini.js';

const env = { GEMINI_API_KEY: 'AIzaSyTESTKEY-0123456789', GEMINI_TEXT_MODEL: 'gemini-3.8-flash' };

test('Gemini 3 uses low thinking effort and a practical interactive timeout', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'سلام' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateText(env, {
      system: 'پاسخ کوتاه بده',
      contents: [{ role: 'user', parts: [{ text: 'سلام' }] }],
    });
    assert.deepEqual(result, { text: 'سلام' });
    assert.equal(AI_TIMEOUT_MS, 100_000);
    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.deepEqual(request.body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
    assert.equal(request.body.generationConfig.maxOutputTokens, 1024);
    assert.equal(request.init.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini HTTP errors remain sanitized and classified', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { status: 'RESOURCE_EXHAUSTED', message: 'private provider detail' },
  }), { status: 429 });
  try {
    await assert.rejects(
      generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }] }),
      (error) => error instanceof AiError && error.code === 'AI_QUOTA' && error.status === 429,
    );
  } finally {
    globalThis.fetch = original;
  }
});
