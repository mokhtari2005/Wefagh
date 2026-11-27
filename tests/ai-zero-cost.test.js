import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTextWithFallback } from '../worker/src/ai/fallback.js';
import {
  CLOUDFLARE_TEXT_MODEL, generateWorkersAIText, reviewWithWorkersAI,
  workersAiPrimaryEnabled, workersAiReviewEnabled,
} from '../worker/src/ai/cloudflare.js';

const prompt = {
  system: 'دستیار حقوقی؛ هیچ مستند حقوقی را جعل نکن.',
  contents: [{ role: 'user', parts: [{ text: 'برای آزمون فقط پاسخ JSON بده.' }] }],
  maxOutputTokens: 500,
  json: true,
  schema: { type: 'OBJECT', properties: { status: { type: 'STRING' }, text: { type: 'STRING' } } },
};

test('zero-cost mode fails closed and never calls paid providers when Workers AI is not explicitly enabled', async () => {
  let called = false;
  const env = {
    AI_BILLING_MODE: 'zero',
    OPENAI_API_KEY: 'test-openai-key-0123456789',
    GEMINI_API_KEY: 'test-gemini-key-0123456789',
    GROQ_API_KEY: 'test-groq-key-0123456789',
    AI: { run: async () => { called = true; return { response: '{}' }; } },
  };
  await assert.rejects(
    generateTextWithFallback(env, prompt),
    error => error?.code === 'AI_ZERO_COST_PROVIDER_DISABLED',
  );
  assert.equal(called, false);
});

test('Workers AI primary requires both zero-cost mode and an explicit feature flag', () => {
  const binding = { run: async () => ({ response: '{}' }) };
  assert.equal(workersAiPrimaryEnabled({ AI: binding }), false);
  assert.equal(workersAiPrimaryEnabled({ AI_BILLING_MODE: 'zero', WORKERS_AI_PRIMARY_ENABLED: 'true', AI: binding }), false);
  assert.equal(workersAiPrimaryEnabled({ AI_BILLING_MODE: 'zero', WORKERS_AI_FREE_PLAN_CONFIRMED: 'true', WORKERS_AI_PRIMARY_ENABLED: 'true', AI: binding }), true);
});

test('zero-cost mode uses only mocked Workers AI and parses structured JSON', async () => {
  const calls = [];
  const env = {
    AI_BILLING_MODE: 'zero',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'true',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    AI: {
      run: async (model, options) => {
        calls.push({ model, options });
        return { response: JSON.stringify({ status: 'need_info', text: 'برای تعیین مهلت، تاریخ ابلاغ لازم است.' }) };
      },
    },
  };
  const result = await generateTextWithFallback(env, prompt);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, CLOUDFLARE_TEXT_MODEL);
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.data.status, 'need_info');
  assert.match(result.data.text, /تاریخ ابلاغ/);
  assert.equal(calls[0].options.messages[0].content.includes('هیچ مستند حقوقی را جعل نکن'), true);
});

test('Workers AI rejects non-text attachments instead of silently sending them to another provider', async () => {
  const env = {
    AI_BILLING_MODE: 'zero',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'true',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    AI: { run: async () => { throw new Error('must not run'); } },
  };
  await assert.rejects(
    generateWorkersAIText(env, {
      ...prompt,
      contents: [{ role: 'user', parts: [{ text: 'متن' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
    }),
    error => error?.code === 'AI_ZERO_COST_UNSUPPORTED_CONTENT',
  );
});

test('automatic Workers AI legal review is disabled unless explicitly enabled', async () => {
  let called = false;
  const env = {
    AI_BILLING_MODE: 'zero',
    AI: { run: async () => { called = true; return { response: '{}' }; } },
  };
  assert.equal(workersAiReviewEnabled(env), false);
  const result = await reviewWithWorkersAI(env, { mode: 'draft', docType: 'petition', question: 'درخواست', draft: 'متن پیش‌نویس' });
  assert.equal(result.status, 'disabled');
  assert.equal(called, false);
});


test('confirmed Gemini free tier is the zero-cost primary and uses only Gemini 3.5 Flash-Lite', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ status: 'ready', text: 'پاسخ مستند بر پایه بانک حقوقی.' }) }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = {
      AI_BILLING_MODE: 'zero',
      GEMINI_FREE_TIER_CONFIRMED: 'true',
      GEMINI_TEXT_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_API_KEY: 'test-gemini-free-tier-key',
      AI: { run: async () => { throw new Error('Workers AI must not be called'); } },
    };
    const result = await generateTextWithFallback(env, prompt);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.data.status, 'ready');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /models\/gemini-3\.5-flash-lite:generateContent/);
    assert.equal(calls[0].body.tools, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini free-tier quota failure does not retry Gemini 3.8 or call another provider', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let workersCalls = 0;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), {
      status: 429, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const env = {
      AI_BILLING_MODE: 'zero',
      GEMINI_FREE_TIER_CONFIRMED: 'true',
      GEMINI_TEXT_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_API_KEY: 'test-gemini-free-tier-key',
      AI: { run: async () => { workersCalls += 1; return { response: '{}' }; } },
      GROQ_API_KEY: 'test-groq-key-0123456789',
      OPENAI_API_KEY: 'test-openai-key-0123456789',
    };
    await assert.rejects(generateTextWithFallback(env, prompt), error => error?.code === 'AI_QUOTA');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /gemini-3\.5-flash-lite/);
    assert.equal(calls.some(url => url.includes('gemini-3.8-flash')), false);
    assert.equal(workersCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini free-tier confirmation fails closed when its key is missing', async () => {
  let workersCalls = 0;
  await assert.rejects(
    generateTextWithFallback({
      AI_BILLING_MODE: 'zero',
      GEMINI_FREE_TIER_CONFIRMED: 'true',
      GEMINI_TEXT_MODEL: 'gemini-3.5-flash-lite',
      AI: { run: async () => { workersCalls += 1; return { response: '{}' }; } },
    }, prompt),
    error => error?.code === 'AI_ZERO_COST_GEMINI_NOT_CONFIGURED',
  );
  assert.equal(workersCalls, 0);
});


test('Workers AI retries one transient infrastructure failure and then succeeds', async () => {
  let calls = 0;
  const env = {
    AI_BILLING_MODE: 'zero',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'true',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    AI: { run: async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary service unavailable 503');
      return { response: JSON.stringify({ status: 'ready', text: 'پاسخ بازیابی شد.' }) };
    } },
  };
  const result = await generateTextWithFallback(env, prompt);
  assert.equal(calls, 2);
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.data.text, 'پاسخ بازیابی شد.');
});

test('Workers AI quota exhaustion is not retried and never invokes another provider', async () => {
  let calls = 0;
  const env = {
    AI_BILLING_MODE: 'zero',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'true',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    GEMINI_FREE_TIER_CONFIRMED: 'false',
    GEMINI_API_KEY: 'test-gemini-free-tier-key',
    GROQ_API_KEY: 'test-groq-key-0123456789',
    OPENAI_API_KEY: 'test-openai-key-0123456789',
    AI: { run: async () => { calls += 1; throw new Error('429 daily neuron limit exceeded'); } },
  };
  await assert.rejects(
    generateTextWithFallback(env, prompt),
    error => error?.code === 'AI_ZERO_COST_QUOTA',
  );
  assert.equal(calls, 1);
});
