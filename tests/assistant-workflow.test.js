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

test('نام اشخاص الزامی و نشانی و جزئیات تکمیلی اختیاری هستند', () => {
  const fields = getDocumentFields('petition');
  assert.equal(fields.find((field) => field.key === 'partyOneName').required, true);
  assert.equal(fields.find((field) => field.key === 'partyTwoName').required, true);
  assert.equal(fields.find((field) => field.key === 'partyOneAddress').required, false);
  assert.equal(fields.find((field) => field.key === 'additionalDetails').required, false);
});

test('فرم دادخواست تجدیدنظر اطلاعات رأی و ابلاغ را جداگانه دریافت می‌کند', () => {
  const keys = getDocumentFields('appeal').map((field) => field.key);
  assert.ok(keys.includes('issuingCourt'));
  assert.ok(keys.includes('judgmentNumber'));
  assert.ok(keys.includes('judgmentDate'));
  assert.ok(keys.includes('notificationDate'));
});

test('فرم شکواییه و اظهارنامه فیلدهای متناسب با موضوع خود را دارند', () => {
  const criminal = getDocumentFields('criminal_complaint').map((field) => field.key);
  const notice = getDocumentFields('notice').map((field) => field.key);
  assert.ok(criminal.includes('incidentDate'));
  assert.ok(criminal.includes('incidentPlace'));
  assert.ok(criminal.includes('evidenceSummary'));
  assert.ok(notice.includes('noticeSubject'));
  assert.ok(notice.includes('responseDeadline'));
});
