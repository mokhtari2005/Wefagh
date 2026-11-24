import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistantSystemPrompt } from '../worker/src/ai/prompts.js';

test('draft mode forbids process notes inside the document body', () => {
  const prompt = assistantSystemPrompt({ mode: 'draft', docType: 'defense' });
  assert.ok(prompt.includes('قواعد قالب سند'));
  assert.ok(prompt.includes('بازبینی یا راستی‌آزمایی'));
  assert.ok(prompt.includes('[جای خالی: مستند قانونی]'));
  assert.ok(prompt.includes('[جای خالی: امضا]'));
});

test('contract drafting also gets the document format rules', () => {
  const prompt = assistantSystemPrompt({ mode: 'draft', docType: 'contract' });
  assert.ok(prompt.includes('قواعد قالب سند'));
});

test('consult mode does not receive the document format rules', () => {
  const prompt = assistantSystemPrompt({ mode: 'consult' });
  assert.ok(!prompt.includes('قواعد قالب سند'));
});
