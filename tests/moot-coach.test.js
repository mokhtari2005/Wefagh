import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COACH_ROLES, getCoachPrompt, evaluateOralAnswer } from '../site/js/moot-coach.js';
import { readFileSync } from 'node:fs';

test('شبیه‌ساز دو نقش مستقل و پرسش‌های پرونده‌محور دارد', () => {
  assert.ok(COACH_ROLES.judge.prompts.length >= 3);
  assert.ok(COACH_ROLES.opposing.prompts.length >= 3);
  assert.notEqual(getCoachPrompt('judge', 0), getCoachPrompt('opposing', 0));
  assert.equal(getCoachPrompt('judge', 4), getCoachPrompt('judge', 0));
});

test('بازخورد ساختاری برای پاسخ خالی و پاسخ دارای دلیل تمایز می‌گذارد', () => {
  assert.equal(evaluateOralAnswer('').score, 0);
  const result = evaluateOralAnswer('طبق بند قرارداد و مدرک تحویل، زیرا تاریخ تحویل گذشته است؛ بنابراین درخواست خسارت دارم، مشروط به اثبات میزان آن.');
  assert.equal(result.score, 100);
  assert.ok(result.checks.every((item) => item.passed));
  assert.match(result.note, /نشانه‌های متنی|کوتاه است/);
});

test('رابط موت‌کورت شفاف می‌گوید بازخورد، مدل هوش مصنوعی یا نظر حقوقی نیست', () => {
  const source = readFileSync(new URL('../site/js/moot.js', import.meta.url), 'utf8');
  assert.match(source, /شبیه‌ساز پرسش قاضی\/طرف مقابل/);
  assert.match(source, /جایگزین ارزیابی استاد یا بررسی حقوقی نیست/);
});
