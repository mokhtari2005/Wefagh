import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateText, AiError, AI_TIMEOUT_MS } from '../worker/src/ai/gemini.js';

const env = { GEMINI_API_KEY: 'test-key-not-real-0123456789', GEMINI_TEXT_MODEL: 'gemini-3.8-flash' };

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
    assert.equal(AI_TIMEOUT_MS, 40_000);
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

test('Gemini provider 5xx errors expose only safe status diagnostics', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { status: 'INTERNAL', message: 'private provider detail' },
  }), { status: 503 });
  try {
    await assert.rejects(
      generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }] }),
      (error) => error instanceof AiError
        && error.code === 'AI_PROVIDER_ERROR'
        && error.status === 503
        && error.details.providerStatus === 503
        && error.details.providerReason === 'INTERNAL'
        && !JSON.stringify(error).includes('private provider detail'),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini response body timeout is classified and does not wait for the client disconnect', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true });
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      generateText(env, {
        system: 'x',
        contents: [{ role: 'user', parts: [{ text: 'x' }] }],
        timeoutMs: 5,
      }),
      (error) => error instanceof AiError
        && error.code === 'AI_NETWORK_ERROR'
        && error.status === 503
        && error.details.reason === 'TIMEOUT'
        && error.details.stage === 'body',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini network timeout retries once on the bounded Gemini 3.5 Flash-Lite fallback', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init, body: JSON.parse(init.body) });
    if (requests.length === 1) throw new DOMException('timeout', 'TimeoutError');
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"status":"ready","text":"پاسخ","questions":[],"notes":[]}' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateText(env, {
      system: 'x',
      contents: [{ role: 'user', parts: [{ text: 'x' }] }],
      json: true,
      timeoutMs: 12_000,
    });
    assert.equal(result.data.text, 'پاسخ');
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /gemini-3\.8-flash:generateContent$/);
    assert.match(requests[1].url, /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(requests[1].init.signal.aborted, false);
    assert.equal(requests[1].body.generationConfig.thinkingConfig, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
