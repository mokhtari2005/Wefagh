// آزمون تمبر مالیاتی و سهم‌های وکیل. مقدارها با محاسبهٔ دستی گرفته شده‌اند.
// حق‌الوکالهٔ تعرفه‌ای مرحلهٔ نخستین: 40,000,000 × 8٪ = 3,200,000؛ حداقل تمبر: 5٪ آن = 160,000.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';
import { computeStampAndShares } from '../site/js/calc/stamp.js';

const base = { subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 40000000 };
const shareOf = (r, prefix) => r.stamp.shares.find((s) => s.label.startsWith(prefix))?.amount;

test('بدون دریافتی: مبنای تمبر = حداقل قانونی همان مرحله (3,200,000)، تمبر = 160,000', () => {
  const r = computeAttorneyForm(base);
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.stamp.stampBase, 3200000);
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.basisLabel, 'حداقل قانونی تعرفه همان مرحله');
  assert.deepEqual(r.stamp.shares, []);
});

test('مبلغ دریافتی بیشتر از حداقل: تمبر = 5٪ × 10,000,000 = 500,000', () => {
  const r = computeAttorneyForm({ ...base, received: 10000000 });
  assert.equal(r.stamp.stampBase, 10000000);
  assert.equal(r.stamp.stamp, 500000);
  assert.equal(r.stamp.basisLabel, 'مبلغ علی‌الحساب دریافتی از موکل');
});

test('مبلغ دریافتی کمتر از حداقل: تمبر از حداقل قانونی (160,000)', () => {
  const r = computeAttorneyForm({ ...base, received: 1000000 });
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.basisLabel, 'حداقل قانونی تعرفه همان مرحله');
});

test('حق‌الوکالهٔ درج‌شده به‌تنهایی مبنا نیست؛ فقط یادآوری می‌شود که کامل دریافت نشده', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000 });
  assert.equal(r.stamp.stamp, 160000);
  assert.equal(r.stamp.agreedNotFullyReceived, true);
});

test('اگر کل مبلغ درج‌شده دریافت شده باشد، تمبر از آن محاسبه و یادآوری حذف می‌شود', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000, received: 10000000 });
  assert.equal(r.stamp.stamp, 500000);
  assert.equal(r.stamp.agreedNotFullyReceived, false);
});

test('پروانه کانون: صندوق 50٪ و کانون 25٪ مبلغ تمبر، مستقل از سهم مرکز', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon', received: 10000000 });
  assert.equal(shareOf(r, 'سهم صندوق'), 250000);
  assert.equal(shareOf(r, 'سهم کانون'), 125000);
  const other = computeAttorneyForm({ ...base, license: 'kanon', received: 7000000 });
  assert.equal(shareOf(other, 'سهم صندوق'), 175000);
  assert.equal(shareOf(other, 'سهم کانون'), 87500);
});

test('پروانه مرکز: ۵٪ مبلغ دریافتی (10,000,000 → 500,000)، نه حداقل تعرفه', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', received: 10000000 });
  assert.equal(shareOf(r, 'سهم مرکز'), 500000);
  assert.equal(r.stamp.shares.length, 1);
});

test('پروانه مرکز بدون دریافتی: سهم صفر، بدون جایگزینی با حداقل تعرفه', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(r, 'سهم مرکز'), 0);
});

test('پروانه مرکز: سهم کانون و صندوق ندارد', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', received: 10000000, agreedFee: 10000000 });
  assert.equal(shareOf(r, 'سهم کانون'), undefined);
  assert.equal(shareOf(r, 'سهم صندوق'), undefined);
});

test('ختم دعوا: حداقل تمبر از حق‌الوکالهٔ همان مرحله است، نه از سهم ختم دعوا', () => {
  const r = computeAttorneyForm({ ...base, result: 'dismissBefore' });
  assert.equal(r.ok, true);
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.stamp.stamp, 160000);
  assert.notEqual(r.feeTotal, 3200000);
});

test('ماده ۱۸ (قبول پس از نقض): مرحلهٔ مبنا حق‌الوکالهٔ پیش از نقض است', () => {
  const r = computeAttorneyForm({ ...base, afterReversal: true });
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.feeTotal, 1600000);
  assert.equal(r.stamp.stamp, 160000);
});

test('تجدیدنظر: مرحلهٔ مبنا حق‌الوکالهٔ تجدیدنظر (ورودی) است', () => {
  const r = computeAttorneyForm({ ...base, result: 'appealBefore', appealBase: 2000000 });
  assert.equal(r.stamp.stageFee, 2000000);
  assert.equal(r.stamp.stamp, 100000);
});

test('جمع حق‌الوکاله و فوق‌العاده تغییر نمی‌کند و تمبر جداست', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', outProvinceDays: 1, received: 10000000 });
  assert.equal(r.total, 3200000 + 3000000);
});

test('تابع مستقل: مبنا و سهم‌ها از ارقام خودشان به‌درستی حساب می‌شوند', () => {
  const r = computeStampAndShares({ stageFee: 1000000, received: 0, license: 'kanon' });
  assert.equal(r.stamp, 50000);
  assert.equal(r.shares[0].amount, 25000);
  assert.equal(r.shares[1].amount, 12500);
  const m = computeStampAndShares({ stageFee: 1000000, received: 2000000, license: 'markaz' });
  assert.equal(m.shares[0].amount, 100000);
  assert.equal(m.stamp, 100000);
});

test('بدون حق‌الوکالهٔ تعرفه‌ای مثبت، تمبر محاسبه نمی‌شود', () => {
  assert.equal(computeStampAndShares({ stageFee: 0 }).ok, false);
});
