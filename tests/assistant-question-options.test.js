import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_SCHEMA, assistantSystemPrompt } from '../worker/src/ai/prompts.js';

test('ساختار پاسخ مشاوره از پرسش‌های چندگزینه‌ای کنترل‌شده پشتیبانی می‌کند', () => {
  const options = ASSISTANT_SCHEMA.properties.questionOptions;
  assert.equal(options.type, 'ARRAY');
  assert.equal(options.items.type, 'OBJECT');
  assert.ok(options.items.properties.options);
  assert.ok(options.items.properties.allowOther);
  assert.ok(ASSISTANT_SCHEMA.properties.suggestedDocType);
  assert.ok(ASSISTANT_SCHEMA.properties.suggestedDocType.enum.every((value) => value.length > 0));
  assert.ok(ASSISTANT_SCHEMA.properties.knownFields);
});

test('دستور مشاوره گزینه‌های واقعی و امکان توضیح آزاد را پیش‌بینی می‌کند', () => {
  const prompt = assistantSystemPrompt({ mode: 'consult', docType: 'petition' });
  assert.match(prompt, /questionOptions/u);
  assert.match(prompt, /صرفاً برای گزارش بازبینی مستقل/u);
  assert.match(prompt, /گزینه ساختگی نساز/u);
  assert.match(prompt, /knownFields/u);
  assert.match(prompt, /حدس نزن/u);
  assert.match(prompt, /مناسب‌ترین نوع سند/u);
});
test('پیشنهاد نوع سند در صورت نامشخص بودن حذف می‌شود و مقدار خالی در فهرست مجاز نیست', () => {
  const allowed = ASSISTANT_SCHEMA.properties.suggestedDocType.enum;
  assert.ok(allowed.length > 0);
  assert.ok(allowed.every((value) => typeof value === 'string' && value.trim().length > 0));
  const prompt = assistantSystemPrompt({ mode: 'consult' });
  assert.match(prompt, /فیلد suggestedDocType را در خروجی نیاور/u);
});
