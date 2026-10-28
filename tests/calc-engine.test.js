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

// ---- قواعد افزوده‌شده در این مرحله: متن خوانده شده، هنوز فعال نیست ----

test('ماده ۲۵ (اجرای احکام حقوقی): کف ۴ م و سقف ۲٪ محکوم‌به؛ محاسبهٔ دستی مستقل', () => {
  // محاسبهٔ دستی: min(max(محکوم‌به×۲٪, ۴ م), ...) — سقف ۲٪ با کف ۴ م اعمال می‌شود
  const manual = (base) => Math.max(4000000, Math.round(base * 0.02));
  assert.equal(manual(100000000), 4000000);   // ۲٪ = ۲ م < کف ۴ م
  assert.equal(manual(200000000), 4000000);   // ۲٪ = ۴ م
  assert.equal(manual(1000000000), 20000000); // ۲٪ = ۲۰ م
  const rule = findRule(1405, 'attorney-article25-enforcement-judgment');
  assert.equal(rule.maxPercent, 2);
  assert.equal(rule.min, 4000000);
  assert.equal(applyRule({ ...rule, status: 'verified' }, { amount: 1000000000 }).error, 'RULE_UNVERIFIED');
});

test('ماده ۲۵ (سایر امور اجرایی): بازهٔ ۴ م تا ۱۵۰ م، بدون محاسبهٔ مبلغ', () => {
  const rule = findRule(1405, 'attorney-article25-enforcement');
  assert.equal(rule.min, 4000000);
  assert.equal(rule.max, 150000000);
});

test('ماده ۲۱: تقسیم ۶۰٪ نخستین و ۴۰٪ تجدیدنظر و جمعشان ۱۰۰٪ است', () => {
  const rule = findRule(1405, 'attorney-article21-stage-split');
  const total = rule.shares.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.equal(rule.shares.find((s) => s.stage === 'first').share, 0.6);
});

test('ماده ۱۲: سهم‌ها نسبت به حق‌الوکالهٔ همان مرحله‌اند و هیچ‌کدام بدون ورودی مرحله محاسبه نمی‌شوند', () => {
  const rule = findRule(1405, 'attorney-article12-termination');
  assert.deepEqual(rule.items.map((i) => i.share), [0.25, 0.5, 1, 0.25, 0.5]);
  assert.equal(applyRule({ ...rule, status: 'verified' }, { amount: 1000000 }).error, 'RULE_UNVERIFIED');
});

test('ماده ۱۴: طبقه‌ها بازه‌اند؛ بازهٔ کلی از کمترین کف تا بیشترین سقف طبقات است (محاسبهٔ دستی)', () => {
  const a = findRule(1405, 'attorney-article14-criminal-a');
  assert.equal(a.min, Math.min(...a.classes.map((c) => c.min)));
  assert.equal(a.max, Math.max(...a.classes.map((c) => c.max)));
  const b = findRule(1405, 'attorney-article14-criminal-b');
  assert.equal(b.min, Math.min(...b.classes.map((c) => c.min)));
  assert.equal(b.max, Math.max(...b.classes.map((c) => c.max)));
  assert.equal(applyRule({ ...a, status: 'verified' }, { amount: 1000 }).error, 'RULE_UNVERIFIED');
});

test('ماده ۲۴: تشخیصی است و هرگز محاسبه نمی‌شود', () => {
  const rule = findRule(1405, 'attorney-article24-withdrawal');
  assert.equal(rule.kind, 'discretionary');
  assert.equal(applyRule({ ...rule, status: 'verified' }, { amount: 1000 }).error, 'RULE_UNVERIFIED');
});

test('جدول ۱۶ (لایحه ۱۴۰۵): سه نرخ ۲٫۵٪ / ۴٫۵٪ / ۵٫۵٪ و ۳٫۵٪ ثبت شده، مبنا «ارزش خواسته» است', () => {
  assert.deepEqual(findRule(1405, 'court-fee-financial-first').candidateTiers, [
    { upTo: 200000000, percent: 2.5 },
    { upTo: null, percent: 3.5 },
  ]);
  assert.equal(findRule(1405, 'court-fee-financial-appeal').tiers[0].percent, 4.5);
  assert.equal(findRule(1405, 'court-fee-financial-cassation').tiers[0].percent, 5.5);
  assert.match(findRule(1405, 'court-fee-financial-first').base, /ارزش خواسته/);
});

test('فهرست قواعد: هر kind شناخته‌شده است و قاعدهٔ غیر از tiered/fixed محاسبه نمی‌شود', () => {
  const known = new Set(['tiered', 'fixed', 'range', 'share', 'discretionary']);
  for (const r of RATES_BY_YEAR[1405]) {
    assert.ok(known.has(r.kind), `kind ناشناخته: ${r.id}`);
    if (r.kind !== 'tiered' && r.kind !== 'fixed') {
      assert.equal(applyRule({ ...r, status: 'verified' }, { amount: 1000000 }).error, 'RULE_UNVERIFIED', r.id);
    }
  }
});
