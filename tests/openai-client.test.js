import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAIText, openaiConfigured, openaiModelId, toOpenAIJsonSchema } from '../worker/src/ai/openai.js';

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
  schema: { type: 'OBJECT', properties: { status: { type: 'STRING' }, optionalNote: { type: 'STRING' } }, required: ['status'] },
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
    assert.equal(request.body.response_format.type, 'json_schema');
    assert.equal(request.body.response_format.json_schema.strict, true);
    assert.deepEqual(request.body.response_format.json_schema.schema.required, ['status', 'optionalNote']);
    assert.deepEqual(request.body.response_format.json_schema.schema.properties.optionalNote, { anyOf: [{ type: 'string' }, { type: 'null' }] });
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


test('converts nested Gemini schemas to strict OpenAI JSON Schema with nullable optional fields', () => {
  const schema = toOpenAIJsonSchema({
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      details: {
        type: 'OBJECT',
        properties: { enabled: { type: 'BOOLEAN' } },
      },
      choices: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['title', 'choices'],
  });
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['title', 'details', 'choices']);
  assert.deepEqual(schema.properties.details, {
    anyOf: [{
      type: 'object',
      properties: { enabled: { anyOf: [{ type: 'boolean' }, { type: 'null' }] } },
      required: ['enabled'],
      additionalProperties: false,
    }, { type: 'null' }],
  });
  assert.deepEqual(schema.properties.choices, { type: 'array', items: { type: 'string' } });
});
