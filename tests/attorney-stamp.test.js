// آزمون تمبر مالیاتی و سهم‌های وکیل. مقدارها با محاسبهٔ دستی از حق‌الوکالهٔ ۳٬۲۰۰٬۰۰۰ ریال (بهای خواسته ۴۰٬۰۰۰٬۰۰۰ ریال، ماده ۹ غیرقطعی) گرفته شده‌اند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';
import { computeStampAndShares } from '../site/js/calc/stamp.js';

// حق‌الوکاله: 40,000,000 × 8٪ = 3,200,000
const base = { subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 40000000 };
const shareOf = (r, prefix) => r.stamp.shares.find((s) => s.label.startsWith(prefix))?.amount;

test('تمبر ۵٪ حق‌الوکاله است: 3,200,000 × 5٪ = 160,000 ریال، بدون پروانه هم محاسبه می‌شود', () => {
  const r = computeAttorneyForm(base);
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.basisLabel, 'حداقل قانونی (۵٪ حق‌الوکاله تعرفه‌ای)');
  assert.deepEqual(r.stamp.shares, []);
});

test('پروانه کانون: صندوق ۵۰٪ و کانون ۲۵٪ مبلغ تمبر، هر کدام مستقل', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon' });
  assert.equal(shareOf(r, 'سهم صندوق'), 80000);
  assert.equal(shareOf(r, 'سهم کانون'), 40000);
  assert.equal(r.stamp.shares.length, 2);
});

test('پروانه مرکز: ۵٪ حق‌الوکاله (160,000)، بدون سهم کانون و صندوق', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(r, 'سهم مرکز'), 160000);
  assert.equal(r.stamp.shares.length, 1);
  assert.equal(shareOf(r, 'سهم کانون'), undefined);
  assert.equal(shareOf(r, 'سهم صندوق'), undefined);
});

test('مبلغ علی‌الحساب بیشتر از حداقل: تمبر از مبلغ دریافتی، 10,000,000 × 5٪ = 500,000', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon', received: 10000000 });
  assert.equal(r.stamp.stampFromReceived, 500000);
  assert.equal(r.stamp.stampLegalMinimum, 160000);
  assert.equal(r.stamp.stamp, 500000);
  assert.equal(r.stamp.basisLabel, 'مبلغ علی‌الحساب دریافتی از موکل');
  assert.equal(shareOf(r, 'سهم صندوق'), 250000);
  assert.equal(shareOf(r, 'سهم کانون'), 125000);
});

test('مبلغ علی‌الحساب کمتر از حداقل: تمبر از حداقل قانونی، نه از مبلغ دریافتی', () => {
  const r = computeAttorneyForm({ ...base, received: 1000000 });
  assert.equal(r.stamp.stampFromReceived, 50000);
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.basisLabel, 'حداقل قانونی (۵٪ حق‌الوکاله تعرفه‌ای)');
});

test('جمع حق‌الوکاله و فوق‌العاده تغییر نمی‌کند و تمبر جدا از آن است', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', outProvinceDays: 1 });
  assert.equal(r.total, 3200000 + 3000000);
});

test('سهم‌ها از حق‌الوکاله و تمبر به‌درستی جدا محاسبه می‌شوند (تابع مستقل)', () => {
  const r = computeStampAndShares({ tariffFee: 1000000, received: 0, license: 'kanon' });
  assert.equal(r.stamp, 50000);
  assert.equal(r.shares[0].amount, 25000);
  assert.equal(r.shares[1].amount, 12500);
  const m = computeStampAndShares({ tariffFee: 1000000, license: 'markaz' });
  assert.equal(m.shares[0].amount, 50000);
});

test('بدون حق‌الوکاله مثبت، تمبر محاسبه نمی‌شود', () => {
  assert.equal(computeStampAndShares({ tariffFee: 0 }).ok, false);
});
