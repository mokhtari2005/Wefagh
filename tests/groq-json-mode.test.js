// آزمون حالت JSON مسیر جایگزین Groq: درخواست باید واژهٔ json داشته باشد تا Groq آن را ۴۰۰ رد نکند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGroqText } from '../worker/src/ai/groq.js';

const env = { GROQ_API_KEY: 'gsk_test_key_0123456789abcdef' };

async function captureRequest(options) {
  const original = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"status":"ready","questions":[]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await generateGroqText(env, options);
  } finally {
    globalThis.fetch = original;
  }
  return sent;
}

test('حالت JSON: یکی از پیام‌ها واژهٔ json دارد، حتی اگر دستور سیستمی آن را نداشته باشد', async () => {
  const body = await captureRequest({
    system: 'به پرسش حقوقی پاسخ بده.',
    contents: [{ role: 'user', parts: [{ text: 'تفاوت فسخ و انفساخ' }] }],
    json: true,
  });
  assert.ok(body.response_format, 'response_format باید در حالت JSON فرستاده شود');
  assert.ok(body.messages.some((m) => /json/i.test(m.content)), 'حداقل یک پیام باید json را داشته باشد');
});

test('بدون حالت JSON: response_format فرستاده نمی‌شود و پیام سیستمی تغییر نمی‌کند', async () => {
  const body = await captureRequest({
    system: 'پاسخ متنی بده.',
    contents: [{ role: 'user', parts: [{ text: 'سلام' }] }],
    json: false,
  });
  assert.equal(body.response_format, undefined);
  assert.ok(!body.messages[0].content.includes('JSON معتبر'));
});
