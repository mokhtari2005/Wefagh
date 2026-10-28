import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieredFee, applyRule, trialFee, TRIAL_WARNING } from '../site/js/calc/engine.js';
import { RATES_BY_YEAR, findRule, SOURCE_DOCUMENTS } from '../site/js/calc/rates.js';

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
  assert.equal(tieredFee({ amount: 1, tiers: [{ upTo: 10, percent: 1 }], mode: 'whole' }).error, 'RULE_UNVERIFIED');
  assert.equal(tieredFee({ amount: 1, tiers: [{ upTo: 10, percent: 1 }, { upTo: 5, percent: 2 }, { upTo: null, percent: 3 }], mode: 'whole' }).error, 'RULE_UNVERIFIED');
});

test('قاعدهٔ text_read هرگز محاسبه نمی‌شود', () => {
  const rule = { ...findRule(1405, 'attorney-article14-criminal-a'), kind: 'tiered', tiers: TIERS, mode: 'whole' };
  assert.equal(applyRule(rule, { amount: 100000000 }).error, 'RULE_UNVERIFIED');
});

test('قاعدهٔ نمونهٔ user_approved محاسبه می‌شود (فقط برای آزمون موتور)', () => {
  const sample = { id: 'x', status: 'user_approved', kind: 'tiered', mode: 'incremental', tiers: TIERS, min: 0, max: null, legal: { citation: 'نمونه' } };
  assert.equal(applyRule(sample, { amount: 300000000 }).fee, 8500000);
});

test('فهرست قواعد: هر قاعده استناد، تاریخ بررسی و شناسهٔ یکتا دارد؛ وضعیت شناخته‌شده است', () => {
  const ids = new Set();
  for (const [year, rules] of Object.entries(RATES_BY_YEAR)) {
    assert.ok(Number(year) >= 1400);
    for (const r of rules) {
      assert.ok(!ids.has(r.id), `شناسهٔ تکراری: ${r.id}`);
      ids.add(r.id);
      assert.ok(r.legal.citation, `بدون استناد: ${r.id}`);
      assert.match(r.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['verified', 'user_approved', 'unverified', 'text_read'].includes(r.status), r.id);
      if (r.status === 'user_approved') {
        assert.equal(r.userApproval?.by, 'user', r.id);
        assert.equal(r.userApproval?.officialVerified, false, r.id);
      }
      if (r.status === 'verified') {
        assert.ok(r.legal.approvedOn && r.legal.effectiveFrom && r.legal.sourceUrl, `قاعدهٔ تأییدشده بدون مستند کامل: ${r.id}`);
      }
    }
  }
});

test('هیچ قاعده‌ای official verified نیست؛ user_approved فقط tiered/fixed را محاسبه می‌کند', () => {
  for (const r of RATES_BY_YEAR[1405]) {
    assert.notEqual(r.status, 'verified', r.id);
    const result = applyRule(r, { amount: 300000000 });
    if (r.status === 'user_approved' && (r.kind === 'tiered' || r.kind === 'fixed')) {
      assert.equal(result.ok, true, r.id);
    } else {
      assert.equal(result.error, 'RULE_UNVERIFIED', r.id);
    }
  }
});

// ---- ماده ۹ ----
test('ماده ۹ (پلکانی بر مازاد): مرزها و نتیجهٔ دستی', () => {
  const rule = findRule(1405, 'attorney-article9-financial-nonfinal');
  assert.equal(rule.status, 'user_approved');
  const cases = [
    [0, 0],
    [300000000, 24000000],     // ۳۰۰ م × ۸٪
    [500000000, 40000000],     // مرز بند الف
    [500000001, 40000000],     // ۱ ریال بالاتر: ۰٫۰۷ ریال → گرد ۰
    [1000000000, 75000000],    // ۴۰ م + ۵۰۰ م × ۷٪ = ۳۵ م
    [2000000000, 145000000],   // ۴۰ م + ۱٫۵ میلیارد × ۷٪ = ۱۰۵ م
    [10000000000, 545000000],  // ۱۴۵ م + ۸ میلیارد × ۵٪ = ۴۰۰ م
    [30000000000, 1345000000], // ۵۴۵ م + ۲۰ میلیارد × ۴٪ = ۸۰۰ م
    [40000000000, 1645000000], // ۱٬۳۴۵ م + ۱۰ میلیارد × ۳٪ = ۳۰۰ م
  ];
  for (const [amount, expected] of cases) {
    const r = applyRule(rule, { amount });
    assert.equal(r.ok, true, String(amount));
    assert.equal(r.fee, expected, `مبلغ ${amount}`);
  }
});

test('ماده ۹ حکم قطعی: ۱۰٪ بدون پله و جدا از غیرقطعی', () => {
  const final = findRule(1405, 'attorney-article9-financial-final');
  assert.equal(applyRule(final, { amount: 1000000 }).fee, 100000);
  assert.notEqual(final.id, findRule(1405, 'attorney-article9-financial-nonfinal').id);
});

// ---- جدول ۱۶ ----
test('دادرسی بدوی: مرز ۲۰۰ میلیون و یک ریال بالاتر (پله‌ای، تصمیم کاربر)', () => {
  const rule = findRule(1405, 'court-fee-financial-first');
  assert.equal(rule.mode, 'incremental');
  assert.equal(applyRule(rule, { amount: 200000000 }).fee, 5000000);
  assert.equal(applyRule(rule, { amount: 300000000 }).fee, 8500000);   // ۵ م + ۳٫۵ م
  assert.equal(applyRule(rule, { amount: 200000001 }).fee, 5000000);   // ۰٫۰۳۵ ریال بر مازاد → گرد ۰
});

test('تجدیدنظر و فرجام: مبنای ارزش خواسته، ۴٫۵٪ و ۵٫۵٪', () => {
  const appeal = findRule(1405, 'court-fee-financial-appeal');
  const cassation = findRule(1405, 'court-fee-financial-cassation');
  assert.equal(appeal.base, 'ارزش خواسته');
  assert.equal(cassation.base, 'ارزش خواسته');
  assert.equal(applyRule(appeal, { amount: 100000000 }).fee, 4500000);
  assert.equal(applyRule(cassation, { amount: 100000000 }).fee, 5500000);
});

test('اقلام ثابت به ریال: ۱٬۵۰۰٬۰۰۰ و ۳۰۰٬۰۰۰', () => {
  assert.equal(applyRule(findRule(1405, 'court-fee-unknown-value'), { amount: 1 }).fee, 1500000);
  assert.equal(applyRule(findRule(1405, 'court-fee-interim-enforcement'), { amount: 1 }).fee, 300000);
  assert.equal(applyRule(findRule(1405, 'court-fee-interlocutory-objection'), { amount: 1 }).fee, 300000);
});

// ---- ماده ۲۵، ۱۲، ۲۱، ۲۴، ۱۴: بدون محاسبه ----
test('ماده ۲۵ (حقوقی): کف ۴ م و سقف ۲٪ محکوم‌به؛ محاسبهٔ دستی مستقل', () => {
  const manual = (base) => Math.max(4000000, Math.round(base * 0.02));
  assert.equal(manual(100000000), 4000000);
  assert.equal(manual(200000000), 4000000);
  assert.equal(manual(1000000000), 20000000);
  const rule = findRule(1405, 'attorney-article25-enforcement-judgment');
  assert.equal(rule.maxPercent, 2);
  assert.equal(applyRule(rule, { amount: 1000000000 }).error, 'RULE_UNVERIFIED');
});

test('ماده ۲۱: ۶۰٪ و ۴۰٪ جمعشان ۱۰۰٪ است', () => {
  const rule = findRule(1405, 'attorney-article21-stage-split');
  assert.ok(Math.abs(rule.shares.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
});

test('ماده ۱۲: سهم‌ها و عدم محاسبه', () => {
  const rule = findRule(1405, 'attorney-article12-termination');
  assert.deepEqual(rule.items.map((i) => i.share), [0.25, 0.5, 1, 0.25, 0.5]);
  assert.equal(applyRule(rule, { amount: 1000000 }).error, 'RULE_UNVERIFIED');
});

test('ماده ۱۴: بازهٔ کلی از کمترین کف تا بیشترین سقف طبقات', () => {
  for (const id of ['attorney-article14-criminal-a', 'attorney-article14-criminal-b']) {
    const r = findRule(1405, id);
    assert.equal(r.min, Math.min(...r.classes.map((c) => c.min)), id);
    assert.equal(r.max, Math.max(...r.classes.map((c) => c.max)), id);
  }
});

test('ماده ۲۴: تشخیصی و محاسبه‌نشدنی', () => {
  const rule = findRule(1405, 'attorney-article24-withdrawal');
  assert.equal(rule.kind, 'discretionary');
  assert.equal(applyRule(rule, { amount: 1000 }).error, 'RULE_UNVERIFIED');
});

// ---- فراداده اسناد ----
test('هر سند: پذیرش کاربر، و احراز رسمی مستقل نیست', () => {
  assert.ok(SOURCE_DOCUMENTS.length >= 4);
  for (const d of SOURCE_DOCUMENTS) {
    assert.equal(d.userAccepted, true, d.id);
    assert.equal(d.independentlyVerifiedOfficialSource, false, d.id);
  }
});

// ---- محاسبهٔ آزمایشی با هشدار (مکانیزم، جدا از قواعد تأییدشده) ----
test('محاسبهٔ آزمایشی: دو تفسیر کنار هم با هشدار؛ فقط روی قاعدهٔ text_read', () => {
  const synthetic = { status: 'text_read', kind: 'tiered', candidateTiers: TIERS, interpretation: { readings: ['whole', 'incremental'] }, mode: null };
  const r = trialFee(synthetic, { amount: 300000000 });
  assert.equal(r.ok, true);
  assert.equal(r.trial, true);
  assert.equal(r.warning, TRIAL_WARNING);
  assert.equal(r.results.whole, 10500000);
  assert.equal(r.results.incremental, 8500000);
});

test('محاسبهٔ آزمایشی هرگز برای قاعدهٔ تأییدشده (user_approved/verified) اجرا نمی‌شود', () => {
  assert.equal(trialFee(findRule(1405, 'court-fee-financial-first'), { amount: 1 }).error, 'USE_APPROVED_PATH');
  assert.equal(trialFee(findRule(1405, 'court-fee-non-financial'), { amount: 1 }).error, 'NOT_TIERED');
});

test('بازه‌ها (range) و سهم‌ها هرگز مبلغ برنمی‌گردانند، حتی با وضعیت تأییدشده', () => {
  for (const r of RATES_BY_YEAR[1405].filter((x) => x.kind !== 'tiered' && x.kind !== 'fixed')) {
    assert.equal(applyRule({ ...r, status: 'user_approved', userApproval: { by: 'user', officialVerified: false } }, { amount: 1000 }).error, 'RULE_UNVERIFIED', r.id);
  }
});
