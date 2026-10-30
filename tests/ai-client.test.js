import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyForApi, validAnswer, ANSWER_MAX, hearingScript, stepStates, SPEAKER_LABEL, VOICE_FOR } from '../site/js/moot-ai.js';
import { trimHistory, summarizeReply, ASSISTANT_NOTICE } from '../site/js/assistant.js';
import { silentWavBlob, AI_ERROR_TEXT, errorText, baseMime } from '../site/js/ai-client.js';

test('تاریخچهٔ ارسالی به سرور از انتها و با سقف ۳۰ مورد انتخاب می‌شود', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'user' : 'ai', speaker: 'judge', text: `پیام ${i}` }));
  const picked = historyForApi(history);
  assert.equal(picked.length, 30);
  assert.equal(picked.at(-1).text, 'پیام 39');
  assert.equal(picked[0].text, 'پیام 10');
  assert.equal(picked[0].speaker, 'judge');
});

test('فهرست مراحل رسیدگی به ترتیب منشی، طرح ادعا، دفاع، پرسش قاضی، مستندات و ختم است', () => {
  const steps = hearingScript();
  assert.equal(steps[0].speaker, 'clerk');
  assert.equal(steps[2].stage, 'claim');
  assert.equal(steps[3].stage, 'defense');
  assert.ok(steps.some((s) => s.speaker === 'judge' && s.stage === 'judge_question_plaintiff'));
  assert.ok(steps.some((s) => s.stage === 'documents'));
  assert.equal(steps.at(-1).speaker, 'clerk');
  assert.ok(steps.every((s) => s.speaker === 'clerk' || s.stage || s.label));
});

test('وضعیت مراحل: گذشته، جاری، آینده', () => {
  assert.deepEqual(stepStates(4, 1), ['done', 'current', 'pending', 'pending']);
});

test('هر گوینده برچسب و صدای مشخص دارد', () => {
  for (const k of ['clerk', 'judge', 'plaintiff', 'defendant']) {
    assert.ok(SPEAKER_LABEL[k]);
    assert.ok(VOICE_FOR[k]);
  }
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
