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
  assert.equal(workersAiPrimaryEnabled({ AI_BILLING_MODE: 'zero', AI: binding }), false);
  assert.equal(workersAiPrimaryEnabled({ AI_BILLING_MODE: 'zero', WORKERS_AI_PRIMARY_ENABLED: 'true', AI: binding }), true);
});

test('zero-cost mode uses only mocked Workers AI and parses structured JSON', async () => {
  const calls = [];
  const env = {
    AI_BILLING_MODE: 'zero',
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
