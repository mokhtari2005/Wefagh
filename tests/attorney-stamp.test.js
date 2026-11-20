// آزمون تمبر مالیاتی با قاعدهٔ «مبنا = حداکثرِ (حداقل تعرفه، مبلغ واقعاً دریافت‌شده)» و
// «اگر کل توافقی دریافت شده، مبنا = مبلغ توافقی».
// بهای خواسته ۴۰ میلیون: حق‌الوکالهٔ کل ۳٬۲۰۰٬۰۰۰ → بدوی ۱٬۹۲۰٬۰۰۰ (۶۰٪)، تجدیدنظر ۱٬۲۸۰٬۰۰۰ (۴۰٪).
// حداقل تمبر: بدوی ۹۶٬۰۰۰؛ تجدیدنظر ۶۴٬۰۰۰.
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
  assert.equal(r.total, 3200000);
});

test('بدون دریافتی: مبنا حداقل تعرفه همان مرحله؛ تمبر ۹۶٬۰۰۰ و ۶۴٬۰۰۰، حتی با توافقی بیشتر', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000 });
  assert.equal(first(r).stamp.stampBase, 1920000);
  assert.equal(first(r).stamp.stamp, 96000);
  assert.equal(appeal(r).stamp.stamp, 64000);
});

test('کل توافقی دریافت شده: مبنا = سهم توافقی هر مرحله (۶ و ۴ میلیون) → تمبر ۳۰۰٬۰۰۰ و ۲۰۰٬۰۰۰', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000, received: 10000000 });
  assert.equal(first(r).stamp.stampBase, 6000000);
  assert.equal(first(r).stamp.stamp, 300000);
  assert.equal(appeal(r).stamp.stampBase, 4000000);
  assert.equal(appeal(r).stamp.stamp, 200000);
  assert.equal(first(r).stamp.basisLabel, 'حق‌الوکالهٔ توافقی (کل آن دریافت شده)');
});

test('بخشی دریافت شده: مبنا = علی‌الحساب دریافتی هر مرحله (۶۰٪ و ۴۰٪ از ۴ میلیون = ۲٬۴۰۰٬۰۰۰ و ۱٬۶۰۰٬۰۰۰) → تمبر ۱۲۰٬۰۰۰ و ۸۰٬۰۰۰', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000, received: 4000000 });
  assert.equal(first(r).stamp.stampBase, 2400000);
  assert.equal(first(r).stamp.stamp, 120000);
  assert.equal(appeal(r).stamp.stampBase, 1600000);
  assert.equal(appeal(r).stamp.stamp, 80000);
  assert.equal(first(r).stamp.basisLabel, 'مبلغ علی‌الحساب واقعاً دریافت‌شده');
});

test('دریافتی کمتر از حداقل تعرفه همان مرحله: حداقل تعرفه ملاک است (۱٬۰۰۰٬۰۰۰ → مبنا ۱٬۹۲۰٬۰۰۰)', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 10000000, received: 1000000 });
  assert.equal(first(r).stamp.stampBase, 1920000);
  assert.equal(first(r).stamp.stamp, 96000);
});

test('توافقی کمتر از تعرفه و کاملاً دریافت شده: حداقل تعرفه ملاک است', () => {
  const r = computeAttorneyForm({ ...base, agreedFee: 2000000, received: 2000000 });
  assert.equal(first(r).stamp.stampBase, 1920000);
  assert.equal(appeal(r).stamp.stampBase, 1280000);
});

test('پروانه کانون با کل توافقی دریافت شده: صندوق ۵۰٪ و کانون ۲۵٪ تمبر مرحلهٔ بدوی', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon', agreedFee: 10000000, received: 10000000 });
  assert.equal(shareOf(first(r), 'سهم صندوق'), 150000);
  assert.equal(shareOf(first(r), 'سهم کانون'), 75000);
  assert.equal(shareOf(appeal(r), 'سهم صندوق'), 100000);
  assert.equal(shareOf(appeal(r), 'سهم کانون'), 50000);
});

test('پروانه مرکز: ۵٪ همان مبنای تمبر؛ با دریافت بخشی ۱۲۰٬۰۰۰ و ۸۰٬۰۰۰', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', agreedFee: 10000000, received: 4000000 });
  assert.equal(shareOf(first(r), 'سهم مرکز'), 120000);
  assert.equal(shareOf(appeal(r), 'سهم مرکز'), 80000);
  const tariffOnly = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(first(tariffOnly), 'سهم مرکز'), 96000);
});

test('پروانه مرکز: سهم کانون و صندوق ندارد', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(first(r), 'سهم کانون'), undefined);
  assert.equal(shareOf(first(r), 'سهم صندوق'), undefined);
});

test('ختم دعوا (ماده ۱۲): تمبر یک‌مرحله‌ای؛ کاملاً دریافت شده → ۱۰ میلیون → ۵۰۰٬۰۰۰، بخشی ۴ میلیون → ۲۰۰٬۰۰۰', () => {
  const full = computeAttorneyForm({ ...base, result: 'dismissBefore', agreedFee: 10000000, received: 10000000 });
  assert.equal(full.stages, null);
  assert.equal(full.stamp.stamp, 500000);
  const partial = computeAttorneyForm({ ...base, result: 'dismissBefore', agreedFee: 10000000, received: 4000000 });
  assert.equal(partial.stamp.stampBase, 4000000);
  assert.equal(partial.stamp.stamp, 200000);
  assert.equal(computeAttorneyForm({ ...base, result: 'dismissBefore' }).stamp.stamp, 160000);
});

test('ماده ۱۸ (قبول پس از نقض): تمبر یک‌مرحله‌ای از حق‌الوکالهٔ پیش از نقض', () => {
  const r = computeAttorneyForm({ ...base, afterReversal: true });
  assert.equal(r.stages, null);
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.stamp.stamp, 160000);
});

test('تجدیدنظر (قرار سقوط): تمبر از ۴۰٪ حق‌الوکالهٔ کل', () => {
  const r = computeAttorneyForm({ ...base, result: 'appealBefore' });
  assert.equal(r.stages, null);
  assert.equal(r.stamp.stageFee, 1280000);
  assert.equal(r.stamp.stamp, 64000);
});

test('جمع حق‌الوکاله و فوق‌العاده تغییر نمی‌کند و تمبر جداست', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', outProvinceDays: 1, agreedFee: 10000000, received: 10000000 });
  assert.equal(r.total, 3200000 + 3000000);
});

test('تابع مستقل: مبنا = بیشتر بودن حداقل تعرفه و مبلغ دریافتی یا (در صورت دریافت کامل) توافقی', () => {
  const partial = computeStampAndShares({ stageFee: 1000000, agreedFee: 2000000, receivedFee: 1500000 });
  assert.equal(partial.stampBase, 1500000);
  assert.equal(partial.stamp, 75000);
  const full = computeStampAndShares({ stageFee: 1000000, agreedFee: 2000000, receivedFee: 2000000, fullyReceived: true, license: 'markaz' });
  assert.equal(full.stampBase, 2000000);
  assert.equal(full.stamp, 100000);
  assert.equal(full.shares[0].amount, 100000);
  const none = computeStampAndShares({ stageFee: 1000000, license: 'kanon' });
  assert.equal(none.stampBase, 1000000);
  assert.equal(none.shares[0].amount, 25000);
  assert.equal(computeStampAndShares({ stageFee: 0 }).ok, false);
});
