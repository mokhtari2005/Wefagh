import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTextWithFallback } from '../worker/src/ai/fallback.js';
import worker from '../worker/src/index.js';
import {
  CLOUDFLARE_TEXT_MODEL, workersAiPrimaryEnabled, workersAiReviewEnabled,
  generateWorkersAIText, reviewWithWorkersAI,
} from '../worker/src/ai/cloudflare.js';

const prompt = {
  system: 'دستور حقوقی و حفظ پرسش‌های تکمیلی',
  contents: [{ role: 'user', parts: [{ text: 'برای تکمیل اطلاعات، پرسش لازم را مطرح کن.' }] }],
  maxOutputTokens: 700,
  json: true,
};

function enabledEnv(run) {
  return {
    AI: { run },
    AI_BILLING_MODE: 'zero',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'true',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    WORKERS_AI_REVIEW_ENABLED: 'false',
    OPENAI_API_KEY: 'sk-test-should-never-be-used-123456789',
    GEMINI_API_KEY: 'test-gemini-key-123456789',
    GROQ_API_KEY: 'gsk_test_key_for_unit_tests_123456789',
  };
}

test('Workers AI is fail-closed unless all zero-cost and Free-plan confirmations are explicit', () => {
  assert.equal(workersAiPrimaryEnabled({ AI: { run() {} }, AI_BILLING_MODE: 'zero' }), false);
  assert.equal(workersAiPrimaryEnabled({
    AI: { run() {} }, AI_BILLING_MODE: 'zero',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
  }), false);
  assert.equal(workersAiPrimaryEnabled({
    AI: { run() {} }, AI_BILLING_MODE: 'zero',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'true',
  }), true);
  assert.equal(workersAiReviewEnabled({ AI: { run() {} }, WORKERS_AI_REVIEW_ENABLED: 'true' }), false);
});

test('zero-cost mode calls GLM through mocked binding and never falls back to paid providers', async () => {
  const calls = [];
  const env = enabledEnv(async (model, options) => {
    calls.push({ model, options });
    return { response: JSON.stringify({ status: 'need_info', questions: ['تاریخ قرارداد چیست؟'], notes: [], text: '' }) };
  });
  const result = await generateTextWithFallback(env, prompt);
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.model, CLOUDFLARE_TEXT_MODEL);
  assert.equal(result.data.status, 'need_info');
  assert.deepEqual(result.data.questions, ['تاریخ قرارداد چیست؟']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/zai-org/glm-4.7-flash');
  assert.equal(calls[0].options.response_format.type, 'json_object');
});

test('zero-cost mode fails closed if Free plan confirmation is missing, without network fallback', async () => {
  let calls = 0;
  const env = {
    AI: { run: async () => { calls++; return { response: '{}' }; } },
    AI_BILLING_MODE: 'zero',
    WORKERS_AI_PRIMARY_ENABLED: 'true',
    OPENAI_API_KEY: 'sk-test-should-never-be-used-123456789',
    GEMINI_API_KEY: 'test-gemini-key-123456789',
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('paid provider must not be called'); };
  try {
    await assert.rejects(generateTextWithFallback(env, prompt), error => error.code === 'AI_ZERO_COST_PROVIDER_DISABLED');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Workers AI rejects attachments rather than silently sending them to a paid provider', async () => {
  const env = enabledEnv(async () => { throw new Error('must not call model for unsupported content'); });
  await assert.rejects(generateWorkersAIText(env, {
    ...prompt,
    contents: [{ role: 'user', parts: [{ text: 'فایل' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
  }), error => error.code === 'AI_ZERO_COST_UNSUPPORTED_CONTENT');
});

test('Workers AI review is disabled by default and performs no inference', async () => {
  let calls = 0;
  const result = await reviewWithWorkersAI({
    AI: { run: async () => { calls++; return { response: '{}' }; } },
    WORKERS_AI_REVIEW_ENABLED: 'true',
    WORKERS_AI_FREE_PLAN_CONFIRMED: 'false',
  }, { mode: 'draft', question: 'درخواست', draft: 'پیش‌نویس' });
  assert.equal(result.status, 'disabled');
  assert.equal(calls, 0);
});

test('assistant keeps interactive need_info flow in zero-cost mode without Gemini search or Groq review', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => sql.includes('FROM sessions')
              ? { id: 7, email: 'user@example.com', display_name: 'کاربر' }
              : null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const env = enabledEnv(async (model, options) => {
    calls.push({ model, options });
    return { response: JSON.stringify({
      status: 'need_info',
      questions: ['تاریخ انعقاد قرارداد چه زمانی است؟'],
      questionOptions: [{ question: 'تاریخ انعقاد قرارداد چه زمانی است؟', options: ['۱۴۰۲', '۱۴۰۳'], allowOther: true }],
      notes: [],
      text: 'برای بررسی دقیق، ابتدا تاریخ قرارداد را مشخص کنید.',
    }) };
  });
  env.DB = db;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('zero-cost request must not call external HTTP services'); };
  try {
    const request = new Request('https://mokhtari.ir/api/ai/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'wefagh_session=test-session' },
      body: JSON.stringify({ mode: 'consult', message: 'در خصوص قرارداد و چک راهنمایی می‌خواهم.', history: [] }),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'need_info');
    assert.equal(body.questions[0], 'تاریخ انعقاد قرارداد چه زمانی است؟');
    assert.equal(body.questionOptions[0].options.length, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, CLOUDFLARE_TEXT_MODEL);
    assert.match(calls[0].options.messages[0].content, /جست‌وجوی Google Search وابسته به Gemini در حالت صفرهزینه اجرا نشد/);
    assert.equal(body.reviewStatus, 'skipped_zero_cost');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('zero-cost assistant runs the explicitly enabled Workers AI reviewer after draft generation', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => sql.includes('FROM sessions')
              ? { id: 7, email: 'user@example.com', display_name: 'کاربر' }
              : null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const env = enabledEnv(async (model, options) => {
    calls.push({ model, options });
    if (calls.length === 1) {
      return { response: JSON.stringify({
        status: 'ready', questions: [], notes: [],
        text: 'پیش‌نویس دادخواست برای مطالبه وجه قرارداد.',
      }) };
    }
    return { response: JSON.stringify({
      risk: 'medium',
      summary: 'یک بازبینی ماشینی انجام شد.',
      issues: [{ severity: 'medium', category: 'ابهام', observation: 'تاریخ قرارداد مشخص نیست.', recommendation: 'تاریخ قرارداد درج شود.' }],
      citations: [],
    }) };
  });
  env.DB = db;
  env.WORKERS_AI_REVIEW_ENABLED = 'true';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('zero-cost review must not call external HTTP services'); };
  try {
    const request = new Request('https://mokhtari.ir/api/ai/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'wefagh_session=test-session' },
      body: JSON.stringify({
        mode: 'draft', docType: 'petition',
        message: 'دادخواست مطالبه وجه قرارداد را تنظیم کن.',
        history: [],
      }),
    });
    const response = await worker.fetch(request, env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.reviewStatus, 'reviewed');
    assert.equal(body.reviewReport.summary, 'یک بازبینی ماشینی انجام شد.');
    assert.equal(body.reviewReport.issues.length, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].model, CLOUDFLARE_TEXT_MODEL);
    assert.equal(calls[1].model, '@cf/zai-org/glm-4.7-flash');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
