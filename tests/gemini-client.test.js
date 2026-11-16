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

test('Gemini response body timeout is classified safely', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    const response = new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    response.json = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    return response;
  };
  try {
    await assert.rejects(
      generateText(env, {
        system: 'x',
        contents: [{ role: 'user', parts: [{ text: 'x' }] }],
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
      timeoutMs: 40_000,
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


test('Gemini response-body timeout retries once on Flash-Lite', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    if (requests.length === 1) {
      const response = new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      response.json = async () => { throw new DOMException('timeout', 'TimeoutError'); };
      return response;
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'پاسخ جایگزین' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateText(env, {
      system: 'x',
      contents: [{ role: 'user', parts: [{ text: 'x' }] }],
    });
    assert.deepEqual(result, { text: 'پاسخ جایگزین' });
    assert.equal(requests.length, 2);
    assert.ok(requests[1].url.endsWith('/models/gemini-3.5-flash-lite:generateContent'));
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini provider 503 falls back once to Flash-Lite', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    if (requests.length === 1) return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'پاسخ' }] } }] }), { status: 200 });
  };
  try {
    const result = await generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }] });
    assert.deepEqual(result, { text: 'پاسخ' });
    assert.equal(requests.length, 2);
    assert.ok(requests[1].endsWith('/models/gemini-3.5-flash-lite:generateContent'));
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini model-unavailable (404) falls back, but quota (429) and access errors (403) do not', async () => {
  const original = globalThis.fetch;
  try {
    let modelCalls = 0;
    globalThis.fetch = async () => {
      modelCalls += 1;
      if (modelCalls === 1) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    };
    const modelResult = await generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }] });
    assert.equal(modelResult.text, 'ok');
    assert.equal(modelCalls, 2, 'مدل ناموجود یک بار با مدل جایگزین امتحان می‌شود');

    for (const [status, code] of [[403, 'AI_KEY_REJECTED'], [429, 'AI_QUOTA']]) {
      let calls = 0;
      globalThis.fetch = async () => { calls += 1; return new Response('{}', { status }); };
      await assert.rejects(
        generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }] }),
        (error) => error.code === code,
      );
      assert.equal(calls, 1, `status ${status} نباید retry شود`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('JSON قطع‌شده با MAX_TOKENS ترمیم می‌شود و truncated=true برمی‌گردد', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"status":"ready","questions":[],"text":"دادخواست\\nخواهان در' }] } }],
  }), { status: 200 });
  try {
    const result = await generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }], json: true });
    assert.equal(result.truncated, true);
    assert.equal(result.data.text, 'دادخواست\nخواهان در');
  } finally {
    globalThis.fetch = original;
  }
});

test('JSON خراب بدون MAX_TOKENS ترمیم نمی‌شود و AI_EMPTY می‌دهد', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"status":"ready","text":"ab' }] } }],
  }), { status: 200 });
  try {
    await assert.rejects(
      generateText(env, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }], json: true }),
      (e) => e.code === 'AI_EMPTY',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini 2.5 Flash با تفکر خاموش (thinkingBudget=0) فراخوانی می‌شود', async () => {
  const original = globalThis.fetch;
  let body;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'سلام' }] } }] }), { status: 200 });
  };
  try {
    await generateText({ GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_TEXT_MODEL: 'gemini-2.5-flash' }, { system: 'x', contents: [{ role: 'user', parts: [{ text: 'x' }] }] });
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  } finally {
    globalThis.fetch = original;
  }
});
