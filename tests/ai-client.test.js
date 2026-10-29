import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyForApi, validAnswer, ANSWER_MAX } from '../site/js/moot-ai.js';
import { trimHistory, summarizeReply, ASSISTANT_NOTICE } from '../site/js/assistant.js';
import { silentWavBlob, AI_ERROR_TEXT, errorText, baseMime } from '../site/js/ai-client.js';

test('تاریخچهٔ ارسالی به سرور از انتها و با سقف ۱۲ مورد انتخاب می‌شود', () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'user' : 'ai', text: `پیام ${i}` }));
  const picked = historyForApi(history);
  assert.equal(picked.length, 12);
  assert.equal(picked.at(-1).text, 'پیام 19');
  assert.equal(picked[0].text, 'پیام 8');
});

test('پاسخ خالی و بیش از حد طولانی رد می‌شود', () => {
  assert.equal(validAnswer('   ').ok, false);
  assert.equal(validAnswer('a'.repeat(ANSWER_MAX + 1)).ok, false);
  assert.deepEqual(validAnswer('  متن  '), { ok: true, text: 'متن' });
});

test('تاریخچهٔ دستیار حداکثر ده مورد می‌ماند و پاسخ پرسش‌های تکمیلی فهرست می‌شود', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ role: 'user', text: `ت${i}` }));
  assert.equal(trimHistory(many).length, 10);
  const reply = summarizeReply({ status: 'need_info', questions: ['موضوع دعوا چیست؟', 'مرجع رسیدگی؟'] });
  assert.match(reply, /موضوع دعوا چیست؟/);
  assert.equal(summarizeReply({ status: 'ready', text: 'متن نهایی' }), 'متن نهایی');
});

test('اطلاعیهٔ دستیار شامل هشدار تطبیق با قوانین جاری است', () => {
  assert.ok(ASSISTANT_NOTICE.includes('توسط وکیل'));
  assert.ok(ASSISTANT_NOTICE.includes('قوانین و مقررات جاری'));
});

test('پیام‌های خطا فارسی‌اند و کد ناشناخته پیام عمومی می‌گیرد', () => {
  assert.ok(AI_ERROR_TEXT.AI_QUOTA.includes('سهمیه'));
  assert.equal(errorText('NOPE'), 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.');
  assert.equal(baseMime('audio/webm;codecs=opus'), 'audio/webm');
});

test('WAV بی‌صدای ساخته‌شده ساختار RIFF درست دارد', async () => {
  const blob = silentWavBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WAVE');
  assert.equal(bytes.length, 44 + 1600);
});
