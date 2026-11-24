import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAIText, openaiConfigured, openaiModelId } from '../worker/src/ai/openai.js';

const env = {
  OPENAI_API_KEY: 'sk-test-openai-key-123456789012345',
  OPENAI_TEXT_MODEL: 'gpt-6.2-astra',
  OPENAI_REASONING_EFFORT: 'medium',
};

const input = {
  system: 'پاسخ حقوقی دقیق بده.',
  contents: [{ role: 'user', parts: [{ text: 'سؤال حقوقی آزمایشی' }] }],
  maxOutputTokens: 1200,
  json: true,
};

function success(content = '{"status":"ready","questions":[],"notes":[],"text":"پاسخ آزمایشی"}') {
  return new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('GPT provider is configured only when a sufficiently long API key exists', () => {
  assert.equal(openaiConfigured(env), true);
  assert.equal(openaiConfigured({}), false);
  assert.equal(openaiConfigured({ OPENAI_API_KEY: 'short' }), false);
  assert.equal(openaiModelId(env), 'gpt-6.2-astra');
  assert.equal(openaiModelId({}), 'gpt-6.2-astra');
});

test('sends structured assistant requests to the configured GPT model and parses JSON', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options, body: JSON.parse(options.body) };
    return success();
  };
  try {
    const result = await generateOpenAIText(env, input);
    assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(request.options.headers.authorization, `Bearer ${env.OPENAI_API_KEY}`);
    assert.equal(request.body.model, 'gpt-6.2-astra');
    assert.equal(request.body.max_completion_tokens, 1200);
    assert.equal(request.body.reasoning_effort, 'medium');
    assert.deepEqual(request.body.response_format, { type: 'json_object' });
    assert.equal(result.provider, 'openai');
    assert.equal(result.model, 'gpt-6.2-astra');
    assert.equal(result.data.status, 'ready');
    assert.equal(result.data.text, 'پاسخ آزمایشی');
    assert.equal(result.usage.total_tokens, 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns plain text when JSON mode is not requested', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => success('پاسخ متنی');
  try {
    const result = await generateOpenAIText(env, { ...input, json: false });
    assert.equal(result.text, 'پاسخ متنی');
    assert.equal(result.data, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not send inline file or image parts to the text-only GPT adapter', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return success(); };
  try {
    await assert.rejects(
      generateOpenAIText(env, {
        ...input,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
      }),
      (error) => error.code === 'AI_UNSUPPORTED_CONTENT',
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('maps rate limiting and invalid credentials to safe provider errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(generateOpenAIText(env, input), (error) => error.code === 'AI_QUOTA');
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    await assert.rejects(generateOpenAIText(env, input), (error) => error.code === 'AI_KEY_REJECTED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
