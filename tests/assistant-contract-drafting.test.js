import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_TYPES } from '../site/js/assistant.js';
import { assistantSystemPrompt } from '../worker/src/ai/prompts.js';

test('assistant exposes a broad, unique domestic contract catalog', () => {
  assert.ok(CONTRACT_TYPES.length >= 30);
  assert.equal(new Set(CONTRACT_TYPES.map(([value]) => value)).size, CONTRACT_TYPES.length);
  for (const [value, label] of CONTRACT_TYPES) {
    assert.ok(value && label);
  }
  assert.ok(CONTRACT_TYPES.some(([value]) => value === 'real_estate_sale'));
  assert.ok(CONTRACT_TYPES.some(([value]) => value === 'employment'));
  assert.ok(CONTRACT_TYPES.some(([value]) => value === 'custom'));
});

test('contract drafting prompt includes tailored legal and factual safeguards', () => {
  const prompt = assistantSystemPrompt({ mode: 'draft', docType: 'contract' });
  assert.match(prompt, /پیش‌نویس قراردادی حرفه‌ای/);
  assert.match(prompt, /اهلیت و سمت طرفین/);
  assert.match(prompt, /مقررات اختصاصی/);
  assert.match(prompt, /\[جای خالی:/);
  assert.match(prompt, /حداکثر در ۳ پرسش/);
});
