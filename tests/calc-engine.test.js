import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieredFee, applyRule } from '../site/js/calc/engine.js';
import { RATES_BY_YEAR, findRule } from '../site/js/calc/rates.js';

// نمونه‌ای فقط برای آزمون موتور؛ عدد واقعی قانونی نیست.
const TIERS = [
  { upTo: 200000000, percent: 2.5 },
  { upTo: null, percent: 3.5 },
];

test('حالت کل مبلغ: مرز دقیق ۲۰۰ میلیون در بازهٔ اول است', () => {
  assert.equal(tieredFee({ amount: 200000000, tiers: TIERS, mode: 'whole' }).fee, 5000000);
  assert.equal(tieredFee({ amount: 200000001, tiers: TIERS, mode: 'whole' }).fee, 7000000);
});

test('حالت پله‌ای: همان مبلغ مرزی و بالاتر، جدا محاسبه می‌شود', () => {
  assert.equal(tieredFee({ amount: 200000000, tiers: TIERS, mode: 'incremental' }).fee, 5000000);
  // ۲۰۰ میلیون × ۲٫۵٪ + ۱۰۰ میلیون × ۳٫۵٪ = ۵ میلیون + ۳٫۵ میلیون
  assert.equal(tieredFee({ amount: 300000000, tiers: TIERS, mode: 'incremental' }).fee, 8500000);
});

test('مبلغ صفر و منفی', () => {
  assert.equal(tieredFee({ amount: 0, tiers: TIERS, mode: 'whole' }).fee, 0);
  assert.equal(tieredFee({ amount: -1, tiers: TIERS, mode: 'whole' }).error, 'INVALID_AMOUNT');
});

test('کف و سقف پس از محاسبه اعمال می‌شوند', () => {
  assert.equal(tieredFee({ amount: 1000, tiers: TIERS, mode: 'whole', min: 50000 }).fee, 50000);
  assert.equal(tieredFee({ amount: 1000000000, tiers: TIERS, mode: 'whole', max: 20000000 }).fee, 20000000);
});

test('بدون mode یا جدول معتبر، قاعده تأییدنشده است', () => {
  assert.equal(tieredFee({ amount: 1, tiers: null, mode: 'whole' }).error, 'RULE_UNVERIFIED');
  assert.equal(tieredFee({ amount: 1, tiers: TIERS, mode: null }).error, 'RULE_UNVERIFIED');
  // مرزها باید صعودی باشند و بازهٔ آخر بی‌سقف
  assert.equal(tieredFee({ amount: 1, tiers: [{ upTo: 10, percent: 1 }], mode: 'whole' }).error, 'RULE_UNVERIFIED');
  assert.equal(tieredFee({ amount: 1, tiers: [{ upTo: 10, percent: 1 }, { upTo: 5, percent: 2 }, { upTo: null, percent: 3 }], mode: 'whole' }).error, 'RULE_UNVERIFIED');
});

test('قاعدهٔ تأییدنشده هرگز محاسبه نمی‌شود، حتی اگر عدد کاندید داشته باشد', () => {
  const rule = findRule(1405, 'court-fee-financial-first');
  assert.equal(rule.status, 'unverified');
  assert.equal(applyRule(rule, { amount: 100000000 }).error, 'RULE_UNVERIFIED');
});

test('قاعدهٔ تأییدشدهٔ نمونه (فقط برای آزمون) محاسبه می‌شود', () => {
  const sample = { id: 'x', status: 'verified', kind: 'tiered', mode: 'incremental', tiers: TIERS, min: 0, max: null, legal: { citation: 'نمونه' } };
  assert.equal(applyRule(sample, { amount: 300000000 }).fee, 8500000);
});

test('فهرست قواعد سالانه: هر قاعده منبع، تاریخ بررسی و شناسهٔ یکتا دارد', () => {
  const ids = new Set();
  for (const [year, rules] of Object.entries(RATES_BY_YEAR)) {
    assert.ok(Number(year) >= 1400);
    for (const r of rules) {
      assert.ok(!ids.has(r.id), `شناسهٔ تکراری: ${r.id}`);
      ids.add(r.id);
      assert.ok(r.legal.citation, `بدون استناد: ${r.id}`);
      assert.match(r.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['verified', 'unverified'].includes(r.status));
      if (r.status === 'verified') {
        assert.ok(r.legal.approvedOn && r.legal.effectiveFrom && r.legal.sourceUrl, `قاعدهٔ تأییدشده بدون مستند کامل: ${r.id}`);
        assert.ok(r.kind === 'fixed' ? typeof r.fixedAmount === 'number' : Array.isArray(r.tiers) && r.mode, `داده ناقص: ${r.id}`);
      }
    }
  }
});

test('هیچ قاعدهٔ ۱۴۰۵ هنوز تأییدشده نیست (تا متن رسمی بررسی شود)', () => {
  for (const r of RATES_BY_YEAR[1405]) assert.equal(r.status, 'unverified', r.id);
});
