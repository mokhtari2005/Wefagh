// آزمون تمبر مالیاتی، سهم‌ها و تفکیک ۶۰٪ بدوی و ۴۰٪ تجدیدنظر (ماده ۲۱). مقدارها با محاسبهٔ دستی گرفته شده‌اند.
// حق‌الوکالهٔ کل: 40,000,000 × 8٪ = 3,200,000 → بدوی 1,920,000 (۶۰٪)، تجدیدنظر 1,280,000 (۴۰٪).
// حداقل تمبر: بدوی 5٪ × 1,920,000 = 96,000؛ تجدیدنظر 5٪ × 1,280,000 = 64,000.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';
import { computeStampAndShares } from '../site/js/calc/stamp.js';

const base = { subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 40000000 };
const first = (r) => r.stages[0];
const appeal = (r) => r.stages[1];
const shareOf = (stage, prefix) => stage.stamp.shares.find((s) => s.label.startsWith(prefix))?.amount;

test('تفکیک ماده ۲۱: بدوی 1,920,000 و تجدیدنظر 1,280,000، جمع برابر حق‌الوکالهٔ کل', () => {
  const r = computeAttorneyForm(base);
  assert.equal(first(r).fee, 1920000);
  assert.equal(appeal(r).fee, 1280000);
  assert.equal(first(r).fee + appeal(r).fee, 3200000);
  assert.equal(r.total, 3200000);
});

test('بدون دریافتی: تمبر هر مرحله از حداقل همان مرحله (96,000 و 64,000)', () => {
  const r = computeAttorneyForm(base);
  assert.equal(first(r).stamp.stamp, 96000);
  assert.equal(appeal(r).stamp.stamp, 64000);
  assert.equal(first(r).stamp.stageFee, 1920000);
  assert.equal(appeal(r).stamp.stageFee, 1280000);
});

test('دریافتی مرحلهٔ بدوی بیشتر از حداقل: 5٪ × 10,000,000 = 500,000؛ تجدیدنظر همچنان حداقل 64,000', () => {
  const r = computeAttorneyForm({ ...base, receivedFirst: 10000000 });
  assert.equal(first(r).stamp.stampBase, 10000000);
  assert.equal(first(r).stamp.stamp, 500000);
  assert.equal(appeal(r).stamp.stamp, 64000);
});

test('دریافتی کمتر از حداقل همان مرحله: تمبر از حداقل قانونی (96,000)', () => {
  const r = computeAttorneyForm({ ...base, receivedFirst: 1000000 });
  assert.equal(first(r).stamp.stamp, 96000);
  assert.equal(first(r).stamp.basisLabel, 'حداقل قانونی تعرفه همان مرحله');
});

test('دریافتی هر مرحله جدا است: تجدیدنظر 2,000,000 → تمبر 100,000، بدوی حداقل 96,000', () => {
  const r = computeAttorneyForm({ ...base, receivedAppeal: 2000000 });
  assert.equal(appeal(r).stamp.receivedAmount, 2000000);
  assert.equal(appeal(r).stamp.stamp, 100000);
  assert.equal(first(r).stamp.stamp, 96000);
});

test('پروانه کانون: صندوق 50٪ و کانون 25٪ تمبر هر مرحله، مستقل', () => {
  const r = computeAttorneyForm({ ...base, license: 'kanon', receivedFirst: 10000000 });
  assert.equal(shareOf(first(r), 'سهم صندوق'), 250000);
  assert.equal(shareOf(first(r), 'سهم کانون'), 125000);
  assert.equal(shareOf(appeal(r), 'سهم صندوق'), 32000);
  assert.equal(shareOf(appeal(r), 'سهم کانون'), 16000);
});

test('پروانه مرکز: ۵٪ دریافتی هر مرحله؛ بدون دریافتی سهم صفر و بدون جایگزینی با حداقل', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', receivedFirst: 10000000, receivedAppeal: 3000000 });
  assert.equal(shareOf(first(r), 'سهم مرکز'), 500000);
  assert.equal(shareOf(appeal(r), 'سهم مرکز'), 150000);
  const none = computeAttorneyForm({ ...base, license: 'markaz' });
  assert.equal(shareOf(first(none), 'سهم مرکز'), 0);
  assert.equal(shareOf(appeal(none), 'سهم مرکز'), 0);
});

test('پروانه مرکز: سهم کانون و صندوق ندارد', () => {
  const r = computeAttorneyForm({ ...base, license: 'markaz', receivedFirst: 10000000 });
  assert.equal(shareOf(first(r), 'سهم کانون'), undefined);
  assert.equal(shareOf(first(r), 'سهم صندوق'), undefined);
});

test('یادآوری وکالت‌نامه روی جمع دریافتی دو مرحله سنجیده می‌شود', () => {
  const low = computeAttorneyForm({ ...base, agreedFee: 10000000, receivedFirst: 3000000 });
  assert.equal(first(low).stamp.agreedNotFullyReceived, true);
  const full = computeAttorneyForm({ ...base, agreedFee: 10000000, receivedFirst: 6000000, receivedAppeal: 4000000 });
  assert.equal(first(full).stamp.agreedNotFullyReceived, false);
});

test('ختم دعوا (ماده ۱۲) تفکیک ۶۰/۴۰ ندارد و تمبر یک‌مرحله‌ای است', () => {
  const r = computeAttorneyForm({ ...base, result: 'dismissBefore' });
  assert.equal(r.ok, true);
  assert.equal(r.stages, null);
  assert.equal(r.stamp.stageFee, 3200000);
  assert.equal(r.stamp.stamp, 160000);
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
  const r = computeAttorneyForm({ ...base, license: 'markaz', outProvinceDays: 1, receivedFirst: 10000000 });
  assert.equal(r.total, 3200000 + 3000000);
});

test('تابع مستقل: مبنا و سهم‌ها از ارقام خودشان', () => {
  const r = computeStampAndShares({ stageFee: 1000000, received: 0, license: 'kanon' });
  assert.equal(r.stamp, 50000);
  assert.equal(r.shares[0].amount, 25000);
  assert.equal(r.shares[1].amount, 12500);
  const m = computeStampAndShares({ stageFee: 1000000, received: 2000000, license: 'markaz' });
  assert.equal(m.shares[0].amount, 100000);
  assert.equal(m.stamp, 100000);
  assert.equal(computeStampAndShares({ stageFee: 0 }).ok, false);
});
