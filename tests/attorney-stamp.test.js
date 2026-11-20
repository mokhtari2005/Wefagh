// آزمون تمبر مالیاتی و سهم‌ها با مبنای جدید: حق‌الوکالهٔ تعرفه‌ای همان مرحله، یا توافقی اگر بیشتر باشد.
// بهای خواسته ۴۰ میلیون: حق‌الوکالهٔ کل ۳٬۲۰۰٬۰۰۰ → بدوی ۱٬۹۲۰٬۰۰۰ (۶۰٪)، تجدیدنظر ۱٬۲۸۰٬۰۰۰ (۴۰٪).
// حداقل تمبر: بدوی ۵٪ × ۱٬۹۲۰٬۰۰۰ = ۹۶٬۰۰۰؛ تجدیدنظر ۵٪ × ۱٬۲۸۰٬۰۰۰ = ۶۴٬۰۰۰.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';
import { computeStampAndShares } from '../site/js/calc/stamp.js';

const base = { subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 40000000 };
const first = (r) => r.stages[0];
const appeal = (r) => r.stages[1];
const shareOf = (stage, prefix) => stage.stamp.shares.find((s) => s.label.startsWith(prefix))?.amount;

test('تفکیک ماده ۲۱: بدوی ۱٬۹۲۰٬۰۰۰ و تجدیدنظر ۱٬۲۸۰٬۰۰۰، جمع برابر حق‌الوکالهٔ کل', () => {
  const r = computeAttorneyForm(base);
  assert.equal(first(r).fee, 1920000);
  assert.equal(appeal(r).fee, 1280000);
  assert.equal(first(r).fee + appeal(r).fee, 3200000);
  assert.equal(r.total, 3200000);
});

test('بدون حق‌الوکالهٔ توافقی: مبنا تعرفه همان مرحله؛ تمبر ۹۶٬۰۰۰ و ۶۴٬۰۰۰', () => {
  const r = computeAttorneyForm(base);
  assert.equal(first(r).stamp.stampBase, 1920000);
  assert.equal(first(r).stamp.stamp, 96000);
  assert.equal(appeal(r).stamp.stamp, 64000);
  assert.equal(first(r).stamp.basisLabel, 'حق‌الوکالهٔ تعرفه‌ای همان مرحله');
});

test('توافقی بیشتر از تعرفه: سهم هر مرحله (۶۰٪ و ۴۰٪ توافقی) مبنا می‌شود؛ ۱۰ میلیون → ۶ و ۴ میلیون', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000 });
  assert.equal(first(r).stamp.stampBase, 6000000);
  assert.equal(first(r).stamp.stamp, 300000);
  assert.equal(appeal(r).stamp.stampBase, 4000000);
  assert.equal(appeal(r).stamp.stamp, 200000);
  assert.equal(first(r).stamp.basisLabel, 'حق‌الوکالهٔ توافقی درج‌شده در وکالت‌نامه');
});

test('توافقی کمتر از تعرفه: تعرفه ملاک است؛ ۲ میلیون → بدوی ۹۶٬۰۰۰ و تجدیدنظر ۶۴٬۰۰۰', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 2000000 });
  assert.equal(first(r).stamp.stampBase, 1920000);
  assert.equal(appeal(r).stamp.stampBase, 1280000);
  assert.equal(first(r).stamp.stamp + appeal(r).stamp.stamp, 160000);
});

test('پروانه کانون: صندوق ۵۰٪ و کانون ۲۵٪ تمبر هر مرحله، مستقل از هم', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon', agreedFee: 10000000 });
  assert.equal(shareOf(first(r), 'سهم صندوق'), 150000);
  assert.equal(shareOf(first(r), 'سهم کانون'), 75000);
  assert.equal(shareOf(appeal(r), 'سهم صندوق'), 100000);
  assert.equal(shareOf(appeal(r), 'سهم کانون'), 50000);
});

test('پروانه مرکز: ۵٪ مبنای هر مرحله (همان مبنای تمبر)، بدون توافقی هم صفر نیست', () => {
  const agreed = computeAttorneyForm({ ...base, license: 'markaz', agreedFee: 10000000 });
  assert.equal(shareOf(first(agreed), 'سهم مرکز'), 300000);
  assert.equal(shareOf(appeal(agreed), 'سهم مرکز'), 200000);
  const tariffOnly = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(first(tariffOnly), 'سهم مرکز'), 96000);
  assert.equal(shareOf(appeal(tariffOnly), 'سهم مرکز'), 64000);
});

test('پروانه مرکز: سهم کانون و صندوق ندارد', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(first(r), 'سهم کانون'), undefined);
  assert.equal(shareOf(first(r), 'سهم صندوق'), undefined);
});

test('ختم دعوا (ماده ۱۲) تمبر یک‌مرحله‌ای؛ با توافقی ۱۰ میلیون مبنا ۱۰ میلیون', () => {
  const r = computeAttorneyForm({ ...base, result: 'dismissBefore' });
  assert.equal(r.stages, null);
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.stamp.stamp, 160000);
  const agreed = computeAttorneyForm({ ...base, result: 'dismissBefore', agreedFee: 10000000 });
  assert.equal(agreed.stamp.stampBase, 10000000);
  assert.equal(agreed.stamp.stamp, 500000);
});

test('ماده ۱۸ (قبول پس از نقض): تمبر یک‌مرحله‌ای از حق‌الوکالهٔ پیش از نقض', () => {
  const r = computeAttorneyForm({ ...base, afterReversal: true });
  assert.equal(r.stages, null);
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.stamp.stamp, 160000);
});

test('تجدیدنظر (قرار سقوط): تمبر از حق‌الوکالهٔ تجدیدنظر ورودی', () => {
  const r = computeAttorneyForm({ ...base, result: 'appealBefore', appealBase: 2000000 });
  assert.equal(r.stages, null);
  assert.equal(r.stamp.stageFee, 2000000);
  assert.equal(r.stamp.stamp, 100000);
});

test('جمع حق‌الوکاله و فوق‌العاده تغییر نمی‌کند و تمبر جداست', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', outProvinceDays: 1, agreedFee: 10000000 });
  assert.equal(r.total, 3200000 + 3000000);
});

test('تابع مستقل: مبنا = بیشتر بودن تعرفه و توافقی؛ سهم‌ها از همان مبنا', () => {
  const r = computeStampAndShares({ stageFee: 1000000, license: 'kanon' });
  assert.equal(r.stampBase, 1000000);
  assert.equal(r.stamp, 50000);
  assert.equal(r.shares[0].amount, 25000);
  assert.equal(r.shares[1].amount, 12500);
  const m = computeStampAndShares({ stageFee: 1000000, agreedFee: 2000000, license: 'markaz' });
  assert.equal(m.stampBase, 2000000);
  assert.equal(m.stamp, 100000);
  assert.equal(m.shares[0].amount, 100000);
  assert.equal(computeStampAndShares({ stageFee: 0 }).ok, false);
});
