import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTextWithFallback, stripGroqFormatting } from '../worker/src/ai/fallback.js';

const env = {
  GEMINI_API_KEY: 'test-gemini-key-123456',
  GEMINI_TEXT_MODEL: 'gemini-2.5-flash',
  GROQ_API_KEY: 'gsk_test_key_12345678901234567890',
};
const input = {
  system: 'پاسخ حقوقی دقیق بده.',
  contents: [{ role: 'user', parts: [{ text: 'ماده تأییدشده بانک: ماده ۱۰ قانون مدنی. سؤال: قرارداد چیست؟' }] }],
  maxOutputTokens: 1200,
};

test('falls back to Groq after Gemini primary and fallback models fail, preserving verified legal context', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    if (calls.length <= 2) return new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 503 });
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'پاسخ جایگزین' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateTextWithFallback(env, input);
    assert.equal(result.provider, 'groq');
    assert.equal(result.text, 'پاسخ جایگزین');
    assert.equal(calls.length, 3);
    assert.match(calls[2].url, /api\.groq\.com/);
    assert.match(calls[2].body.messages.map((m) => m.content).join('\n'), /ماده تأییدشده بانک/);
    assert.match(calls[2].body.messages.map((m) => m.content).join('\n'), /ماده ۱۰ قانون مدنی/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not send requests with attachments to Groq when failover is disabled', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 503 });
  };
  try {
    await assert.rejects(
      generateTextWithFallback(env, input, { allowGroq: false }),
      (error) => error.code === 'AI_PROVIDER_ERROR',
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parses JSON output from Groq for structured assistant responses', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls <= 2) return new Response(JSON.stringify({ error: { status: 'INTERNAL' } }), { status: 503 });
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"status":"ready","questions":[],"notes":[],"text":"**پاسخ حقوقی**\\n\\n## مبنای قانونی\\n- ماده ۱۰ قانون مدنی"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await generateTextWithFallback(env, { ...input, json: true });
    assert.equal(result.provider, 'groq');
    assert.equal(result.data.text, 'پاسخ حقوقی\n\nمبنای قانونی\nماده ۱۰ قانون مدنی');
    assert.equal(result.data.status, 'ready');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('removes Markdown stars, headings and list markers from Groq text while preserving numbering and legal punctuation', () => {
  const raw = '**شکایت کیفری**\n\n## مبنای قانونی\n- ماده ۲۲۲ قانون مجازات اسلامی؛\n1. شرط نخست\n* شرط دوم';
  assert.equal(stripGroqFormatting(raw), 'شکایت کیفری\n\nمبنای قانونی\nماده ۲۲۲ قانون مجازات اسلامی؛\n1. شرط نخست\nشرط دوم');
});
