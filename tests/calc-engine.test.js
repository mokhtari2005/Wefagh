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
  assert.notEqual(rule.status, 'verified');
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
      assert.ok(['verified', 'unverified', 'text_read'].includes(r.status), r.id);
      if (r.status === 'verified') {
        assert.ok(r.legal.approvedOn && r.legal.effectiveFrom && r.legal.sourceUrl, `قاعدهٔ تأییدشده بدون مستند کامل: ${r.id}`);
        assert.ok(r.kind === 'fixed' ? typeof r.fixedAmount === 'number' : Array.isArray(r.tiers) && r.mode, `داده ناقص: ${r.id}`);
      }
    }
  }
});

test('هیچ قاعدهٔ ۱۴۰۵ هنوز تأییدشده نیست؛ متن بازنشرشده محاسبه را فعال نمی‌کند', () => {
  for (const r of RATES_BY_YEAR[1405]) {
    assert.notEqual(r.status, 'verified', r.id);
    assert.equal(applyRule(r, { amount: 100000000 }).error, 'RULE_UNVERIFIED', r.id);
  }
});

// محاسبهٔ دستی مستقل از متن ماده ۹ (بدون فعال‌سازی: فقط یک کپی با وضعیت آزمایشی در تست).
const art9 = findRule(1405, 'attorney-article9-financial-nonfinal');
const art9Test = { ...art9, status: 'verified' };
test('ماده ۹ (پلکانی بر مازاد): مرزها و نتیجهٔ دستی', () => {
  const cases = [
    [0, 0],
    [300000000, 24000000], // ۳۰۰ م × ۸٪
    [500000000, 40000000], // مرز دقیق بند الف
    [500000001, 40000000], // یک واحد بالاتر: ۱ × ۷٪ = ۰ پس از گرد کردن
    [1000000000, 75000000], // ۴۰ م + ۵۰۰ م × ۷٪ = ۳۵ م
    [2000000000, 145000000], // مرز بند ب: ۴۰ م + ۱٫۵ میلیارد × ۷٪ = ۱۰۵ م
    [10000000000, 545000000], // مرز بند پ: ۱۴۵ م + ۸ میلیارد × ۵٪ = ۴۰۰ م
    [30000000000, 1345000000], // مرز بند ت: ۵۴۵ م + ۲۰ میلیارد × ۴٪ = ۸۰۰ م
    [40000000000, 1645000000], // بند ث: ۱٬۳۴۵ م + ۱۰ میلیارد × ۳٪ = ۳۰۰ م
  ];
  for (const [amount, expected] of cases) {
    const r = applyRule(art9Test, { amount });
    assert.equal(r.ok, true, String(amount));
    assert.equal(r.fee, expected, `مبلغ ${amount}`);
  }
});

test('ماده ۹ تبصره/بند حکم قطعی: ۱۰٪ بدون پله', () => {
  const r = applyRule({ ...findRule(1405, 'attorney-article9-financial-final'), status: 'verified' }, { amount: 1000000 });
  assert.equal(r.fee, 100000);
});

test('مقایسه دو تفسیر دادرسی بدوی (فقط آزمون مفهومی؛ فعال نیست)', () => {
  const tiers = [{ upTo: 200000000, percent: 2.5 }, { upTo: null, percent: 3.5 }];
  // ۳۰۰ میلیون: تفسیر کل مبلغ = ۱۰٫۵ م؛ تفسیر پله‌ای = ۵ م + ۳٫۵ م = ۸٫۵ م
  assert.equal(tieredFee({ amount: 300000000, tiers, mode: 'whole' }).fee, 10500000);
  assert.equal(tieredFee({ amount: 300000000, tiers, mode: 'incremental' }).fee, 8500000);
  assert.equal(applyRule(findRule(1405, 'court-fee-financial-first'), { amount: 300000000 }).error, 'RULE_UNVERIFIED');
});

test('بازه‌ها (range) هرگز یک مبلغ انتخاب‌شده برنمی‌گردانند', () => {
  for (const r of RATES_BY_YEAR[1405].filter((x) => x.kind === 'range')) {
    assert.equal(applyRule({ ...r, status: 'verified' }, { amount: 1000 }).error, 'RULE_UNVERIFIED', r.id);
  }
});
