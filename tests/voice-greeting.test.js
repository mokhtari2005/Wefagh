// آزمون ثابت‌های خوشامدگویی صوتی: متن و مسیر فایل باید با هم هماهنگ باشند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_GREETING_TEXT, VOICE_GREETING_AUDIO_SRC } from '../site/js/voice-greeting.js';

test('متن خوشامدگویی شامل نام آکادمی و پیشنهاد کمک است', () => {
  assert.match(VOICE_GREETING_TEXT, /شهرام مختاری/);
  assert.match(VOICE_GREETING_TEXT, /چطور می‌توانم کمک کنم؟$/);
});

test('مسیر فایل خوشامدگویی در پوشهٔ ثابت سایت است', () => {
  assert.equal(VOICE_GREETING_AUDIO_SRC, '/assets/voice/greeting.wav');
});
