// آزمون تمبر مالیاتی و سهم‌های وکیل. مقدارها با محاسبهٔ دستی گرفته شده‌اند.
// حق‌الوکالهٔ تعرفه‌ای: 40,000,000 × 8٪ = 3,200,000؛ حداقل تمبر: 5٪ آن = 160,000.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';
import { computeStampAndShares } from '../site/js/calc/stamp.js';

const base = { subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 40000000 };
const shareOf = (r, prefix) => r.stamp.shares.find((s) => s.label.startsWith(prefix))?.amount;

test('بدون وکالت‌نامه و دریافتی: تمبر = حداقل قانونی 5٪ × 3,200,000 = 160,000 ریال', () => {
  const r = computeAttorneyForm(base);
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.basisLabel, 'حداقل قانونی (۵٪ حق‌الوکاله تعرفه‌ای)');
  assert.deepEqual(r.stamp.shares, []);
});

test('مبنای تمبر حق‌الوکالهٔ درج‌شده است: 10,000,000 × 5٪ = 500,000', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000 });
  assert.equal(r.stamp.stampFromAgreed, 500000);
  assert.equal(r.stamp.stamp, 500000);
  assert.equal(r.stamp.basisLabel, 'حق‌الوکالهٔ درج‌شده در وکالت‌نامه');
});

test('حق‌الوکالهٔ درج‌شده کمتر از حداقل: تمبر از حداقل قانونی (160,000) محاسبه می‌شود', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 1000000 });
  assert.equal(r.stamp.stampFromAgreed, 50000);
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.basisLabel, 'حداقل قانونی (۵٪ حق‌الوکاله تعرفه‌ای)');
});

test('مبلغ علی‌الحساب دریافتی مبنای تمبر نیست؛ تمبر همان حداقل قانونی می‌ماند', () => {
  const r = computeAttorneyForm({ ...base, received: 10000000 });
  assert.equal(r.stamp.stamp, 160000);
});

test('پروانه کانون: صندوق ۵۰٪ و کانون ۲۵٪ مبلغ تمبر، مستقل از دریافتی', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon', agreedFee: 10000000 });
  assert.equal(shareOf(r, 'سهم صندوق'), 250000);
  assert.equal(shareOf(r, 'سهم کانون'), 125000);
  const withReceived = computeAttorneyForm({ ...base, license: 'kanon', agreedFee: 10000000, received: 7000000 });
  assert.equal(shareOf(withReceived, 'سهم صندوق'), 250000);
  assert.equal(shareOf(withReceived, 'سهم کانون'), 125000);
});

test('پروانه مرکز: ۵٪ مبلغ علی‌الحساب دریافتی، نه حق‌الوکاله تعرفه‌ای', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', received: 10000000 });
  assert.equal(shareOf(r, 'سهم مرکز'), 500000);
  assert.equal(r.stamp.shares.length, 1);
});

test('پروانه مرکز بدون مبلغ دریافتی: سهم مرکز صفر است و از حق‌الوکاله حساب نمی‌شود', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(r, 'سهم مرکز'), 0);
});

test('پروانه مرکز: سهم کانون و صندوق ندارد', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', received: 10000000, agreedFee: 10000000 });
  assert.equal(shareOf(r, 'سهم کانون'), undefined);
  assert.equal(shareOf(r, 'سهم صندوق'), undefined);
});

test('جمع حق‌الوکاله و فوق‌العاده تغییر نمی‌کند و تمبر جداست', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', outProvinceDays: 1, agreedFee: 10000000 });
  assert.equal(r.total, 3200000 + 3000000);
});

test('تابع مستقل: تمبر و سهم کانون از مبنای خودشان به‌درستی حساب می‌شوند', () => {
  const r = computeStampAndShares({ tariffFee: 1000000, agreedFee: 0, received: 0, license: 'kanon' });
  assert.equal(r.stamp, 50000);
  assert.equal(r.shares[0].amount, 25000);
  assert.equal(r.shares[1].amount, 12500);
  const m = computeStampAndShares({ tariffFee: 1000000, received: 2000000, license: 'markaz' });
  assert.equal(m.shares[0].amount, 100000);
});

test('بدون حق‌الوکاله تعرفه‌ای مثبت، تمبر محاسبه نمی‌شود', () => {
  assert.equal(computeStampAndShares({ tariffFee: 0 }).ok, false);
});
