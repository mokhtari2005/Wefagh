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
  assert.ok(ASSISTANT_SCHEMA.properties.knownFields);
});

test('دستور مشاوره گزینه‌های واقعی و امکان توضیح آزاد را پیش‌بینی می‌کند', () => {
  const prompt = assistantSystemPrompt({ mode: 'consult', docType: 'petition' });
  assert.match(prompt, /questionOptions/u);
  assert.match(prompt, /گزینه «سایر موارد یا توضیح بیشتر»/u);
  assert.match(prompt, /گزینه‌های ساختگی نساز/u);
  assert.match(prompt, /knownFields/u);
  assert.match(prompt, /حدس نزن/u);
  assert.match(prompt, /مناسب‌ترین نوع سند/u);
});
