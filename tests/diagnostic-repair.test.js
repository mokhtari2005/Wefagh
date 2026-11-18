import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENT_FILES, validReplacement } from '../worker/src/diagnostic-repair.js';

test('عامل اصلاح فقط یک فایل مشخص و مجاز برای هر بخش را می‌پذیرد', () => {
  assert.equal(COMPONENT_FILES['regional-map'], 'site/js/regional-value.js');
  assert.equal(COMPONENT_FILES['voice-typing'], 'site/js/voice-typing.js');
  assert.equal(COMPONENT_FILES.unknown, undefined);
  const original = { path: 'site/js/regional-value.js' };
  assert.equal(validReplacement(original.path, 'export const ok = true;', original), true);
  assert.equal(validReplacement('../wrangler.toml', 'x', original), false);
  assert.equal(validReplacement(original.path, '', original), false);
  assert.equal(validReplacement(original.path, 'x'.repeat(65001), original), false);
});

test('عامل اصلاح هرگز خروجی حاوی کلید یا کلید خصوصی را به GitHub نمی‌فرستد', () => {
  const original = { path: 'site/js/assistant.js' };
  assert.equal(validReplacement(original.path, 'const key = "AIza123456789012345678901234";', original), false);
  assert.equal(validReplacement(original.path, '-----BEGIN PRIVATE KEY-----', original), false);
  assert.equal(validReplacement(original.path, 'const ok = true;', original), true);
});
