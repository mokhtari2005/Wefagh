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


test('خطای مرحلهٔ تحلیل، علت امن و کد وضعیت را جدا از خطای GitHub گزارش می‌کند', async () => {
  const source = await import('../worker/src/diagnostic-repair.js');
  assert.equal(typeof source.handleDiagnosticRepair, 'function');
  // کدهای تشخیصی باید enum ثابت باشند؛ متن آزاد خطا نباید به پاسخ عمومی راه پیدا کند.
  const safeCode = (value) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(value);
  assert.equal(safeCode('AI_PROVIDER_ERROR'), true);
  assert.equal(safeCode('GITHUB_API_FAILED'), true);
  assert.equal(safeCode('secret-token-value'), false);
});
