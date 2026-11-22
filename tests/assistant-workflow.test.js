import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocumentFields } from '../site/js/assistant-workflow.js';

test('فرم سند قضایی اطلاعات متناسب با مرحله پرونده را مرحله‌ای دریافت می‌کند', () => {
  const fields = getDocumentFields('third_party');
  const keys = fields.map((field) => field.key);
  assert.ok(keys.includes('partyOneName'));
  assert.ok(keys.includes('partyTwoName'));
  assert.ok(keys.includes('court'));
  assert.ok(keys.includes('caseNumber'));
  assert.ok(keys.includes('caseStage'));
  assert.ok(keys.includes('additionalDetails'));
});

test('فرم قرارداد پرسش‌های اختصاصی مرجع قضایی و شماره پرونده را تحمیل نمی‌کند', () => {
  const fields = getDocumentFields('contract');
  const keys = fields.map((field) => field.key);
  assert.ok(!keys.includes('court'));
  assert.ok(!keys.includes('caseNumber'));
  assert.ok(keys.includes('partyOneName'));
  assert.ok(keys.includes('partyTwoName'));
});

test('فیلدهای اشخاص و اطلاعات تکمیلی قابل رد هستند تا اطلاعات گفته‌شده دوباره مطالبه نشود', () => {
  for (const field of getDocumentFields('petition')) assert.equal(field.required, false);
});
