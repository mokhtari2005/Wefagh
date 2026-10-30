import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRule } from '../site/js/calc/engine.js';
import { findRule, RATES_BY_YEAR, SOURCE_DOCUMENTS } from '../site/js/calc/rates.js';
import { ATTORNEY_TARIFF, ATTORNEY_ARTICLES, ATTORNEY_NOTES, coverageSummary } from '../site/js/calc/tariff-data.js';

// هر عدد این فایل از متن فایل fd69f537 (آیین‌نامه تعرفه ۱۳۹۸/۱۲/۲۸) برداشته شده و با ارجاع ماده ذکر شده است.
// این آزمون‌ها عدد را از متن می‌گیرند، نه از کد؛ اگر متن و کد اختلاف داشته باشند، آزمون شکست می‌خورد.

const R = (id) => findRule(1405, id);
const calc = (id, input) => applyRule(R(id), input);

// ---------- پوشش متن ----------

test('پوشش: ۳۴ ماده و ۱۰ تبصره، هر کدام یک‌بار و با شمارهٔ صفحهٔ معتبر', () => {
  assert.equal(ATTORNEY_ARTICLES.length, ATTORNEY_TARIFF.articleCount);
  assert.deepEqual(ATTORNEY_ARTICLES.map((a) => a.no), Array.from({ length: 34 }, (_, i) => i + 1));
  assert.equal(ATTORNEY_NOTES.length, ATTORNEY_TARIFF.noteCount);
  for (const a of ATTORNEY_ARTICLES) assert.ok(a.page >= 1 && a.page <= 19, `ماده ${a.no}`);
  for (const n of ATTORNEY_NOTES) assert.ok(n.page >= 1 && n.page <= 19, n.label);
  const pages = ATTORNEY_ARTICLES.map((a) => a.page);
  assert.deepEqual(pages, [...pages].sort((x, y) => x - y), 'صفحه‌ها باید غیرنزولی باشند');
  const counts = coverageSummary();
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 34);
});

test('هر شناسهٔ قاعدهٔ ذکرشده در فهرست ماده‌ها و تبصره‌ها وجود دارد', () => {
  const ids = [...ATTORNEY_ARTICLES, ...ATTORNEY_NOTES].flatMap((x) => x.ruleIds || []);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(findRule(1405, id), id);
});

test('هر قاعدهٔ حق‌الوکاله در فهرست ماده‌ها یا تبصره‌ها دیده می‌شود (هیچ قاعدهٔ یتیم نیست)', () => {
  const mapped = new Set([...ATTORNEY_ARTICLES, ...ATTORNEY_NOTES].flatMap((x) => x.ruleIds || []));
  for (const r of RATES_BY_YEAR[1405].filter((x) => x.group === 'attorney')) {
    assert.ok(mapped.has(r.id), `بدون ماده/تبصره: ${r.id}`);
  }
});

test('ماده‌های calculated قاعده دارند؛ قاعدهٔ محاسبه‌شده فقط با تأیید کاربر است و ماده‌های excluded مبلغ ندارند', () => {
  for (const a of ATTORNEY_ARTICLES) {
    if (a.status === 'calculated') assert.ok(a.ruleIds.length > 0, `ماده ${a.no}`);
    if (a.status === 'excluded') assert.equal(a.ruleIds.length, 0, `ماده ${a.no}`);
  }
  for (const r of RATES_BY_YEAR[1405].filter((x) => x.group === 'attorney')) {
    if (r.kind === 'range' || r.kind === 'discretionary') {
      assert.notEqual(applyRule(r, { amount: 1000000, count: 2 }).ok, true, r.id);
    }
  }
});

test('سند تعرفه در فهرست اسناد با پذیرش کاربر و بدون احراز رسمی ثبت شده است', () => {
  const doc = SOURCE_DOCUMENTS.find((d) => d.id === 'attorney-tariff-fd69f537');
  assert.ok(doc);
  assert.equal(doc.userAccepted, true);
  assert.equal(doc.independentlyVerifiedOfficialSource, false);
  assert.equal(doc.pagesRead, '۱ تا ۱۹ از ۱۹ (کامل)');
});

test('تاریخ‌ها و مصوبه: ۱۳۹۸/۱۲/۲۸ و بدون شاخص تعدیل سالانه', () => {
  assert.equal(ATTORNEY_TARIFF.approvedOn, '1398/12/28');
  assert.match(ATTORNEY_TARIFF.indexation, /هیچ شاخص/);
  for (const r of RATES_BY_YEAR[1405].filter((x) => x.group === 'attorney')) {
    assert.match(r.legal.citation, /fd69f537/, r.id);
  }
});

// ---------- ماده ۵ ----------
test('ماده ۵ (بدون قرارداد، تقسیم مساوی): ۹٬۰۰۰٬۰۰۰ میان ۲ وکیل = ۴٬۵۰۰٬۰۰۰ هرکدام؛ یک وکیل نامعتبر است', () => {
  assert.equal(calc('attorney-article5-equal-split', { amount: 9000000, count: 2 }).fee, 4500000);
  assert.equal(calc('attorney-article5-equal-split', { amount: 9000000, count: 3 }).fee, 3000000);
  assert.equal(calc('attorney-article5-equal-split', { amount: 9000000, count: 1 }).error, 'INVALID_COUNT');
  assert.equal(calc('attorney-article5-equal-split', { amount: 9000000 }).error, 'INVALID_COUNT');
});

// ---------- ماده ۹ ----------
test('ماده ۹ غیرقطعی: ۳۰۰ م = ۲۴ م؛ ۱۰٬۰۰۰ م = ۵۴۵ م؛ ۴۰٬۰۰۰ م = ۱٬۶۴۵ م (تفکیک پلکانی متن)', () => {
  assert.equal(calc('attorney-article9-financial-nonfinal', { amount: 300000000 }).fee, 24000000);
  assert.equal(calc('attorney-article9-financial-nonfinal', { amount: 10000000000 }).fee, 545000000);
  assert.equal(calc('attorney-article9-financial-nonfinal', { amount: 40000000000 }).fee, 1645000000);
});
test('ماده ۹ قطعی: ۱۰٪ بهای خواسته', () => {
  assert.equal(calc('attorney-article9-financial-final', { amount: 1000000000 }).fee, 100000000);
});

// ---------- ماده ۱۲ ----------
const STAGE_12 = 40000000;
test('ماده ۱۲ بند الف: ابطال دادخواست پیش از پاسخ ۱/۴ = ۱۰٬۰۰۰٬۰۰۰', () => {
  assert.equal(calc('attorney-article12-dismissal-before-answer', { amount: STAGE_12 }).fee, 10000000);
});
test('ماده ۱۲ بند ب: رد دادخواست پس از پاسخ ۱/۲ = ۲۰٬۰۰۰٬۰۰۰', () => {
  assert.equal(calc('attorney-article12-dismissal-after-answer', { amount: STAGE_12 }).fee, 20000000);
});
test('ماده ۱۲ بند پ: عدم استماع یا رد به علل مانند مرور زمان = تمام حق‌الوکاله', () => {
  assert.equal(calc('attorney-article12-dismissal-other-grounds', { amount: STAGE_12 }).fee, 40000000);
});
test('ماده ۱۲ بند ت و ث: سقوط تجدیدنظر ۱/۴ و ۱/۲ حق‌الوکالهٔ مرحلهٔ تجدیدنظر', () => {
  assert.equal(calc('attorney-article12-appeal-dismissal-before-answer', { amount: STAGE_12 }).fee, 10000000);
  assert.equal(calc('attorney-article12-appeal-dismissal-after-answer', { amount: STAGE_12 }).fee, 20000000);
});
test('ماده ۱۲ بند ج: اعتراض به قرار حقوقی بازه است (۱ تا ۱۰۰ م) و مبلغ قطعی ندارد', () => {
  const r = R('attorney-article12-interlocutory-objection');
  assert.equal(r.min, 1000000);
  assert.equal(r.max, 100000000);
  assert.equal(applyRule(r, { amount: 5000000 }).error, 'RULE_UNVERIFIED');
});

// ---------- ماده ۱۳ ----------
test('ماده ۱۳ بندهای الف و ب: بازه‌ها با متن برابرند', () => {
  const fam = R('attorney-article13-family');
  const non = R('attorney-article13-nonfinancial');
  assert.deepEqual([fam.min, fam.max], [5000000, 200000000]);
  assert.deepEqual([non.min, non.max], [4000000, 300000000]);
});

// ---------- ماده ۱۴ ----------
test('ماده ۱۴ بند الف طبقات: ۵۰ م تا ۲ میلیارد؛ ۳۰ م تا ۱ میلیارد؛ ۱۰ م تا ۵۰۰ م', () => {
  assert.deepEqual(R('attorney-article14-criminal-a').classes.map((c) => [c.min, c.max]), [
    [50000000, 2000000000], [30000000, 1000000000], [10000000, 500000000],
  ]);
});
test('ماده ۱۴ بند ب طبقات: ۱۰ م تا ۵۰۰ م؛ ۵ م تا ۳۰۰ م؛ ۲ م تا ۲۰۰ م', () => {
  assert.deepEqual(R('attorney-article14-criminal-b').classes.map((c) => [c.min, c.max]), [
    [10000000, 500000000], [5000000, 300000000], [2000000, 200000000],
  ]);
});
test('ماده ۱۴ بندهای پ، ت، ث: ۱ تا ۱۵۰ م؛ ۲ تا ۲۰۰ م؛ ۵۰ تا ۵۰۰ م', () => {
  assert.deepEqual([R('attorney-article14-criminal-objection').min, R('attorney-article14-criminal-objection').max], [1000000, 150000000]);
  assert.deepEqual([R('attorney-article14-criminal-cassation').min, R('attorney-article14-criminal-cassation').max], [2000000, 200000000]);
  assert.deepEqual([R('attorney-article14-criminal-special').min, R('attorney-article14-criminal-special').max], [50000000, 500000000]);
});
test('ماده ۱۴ تبصرهٔ ۱: ۵۰٪ دادسرا، ۳۰٪ بدوی، ۲۰٪ تجدیدنظر از ۱۰۰ م = ۵۰ م، ۳۰ م، ۲۰ م؛ بدون دادسرا ۸۰ م', () => {
  const total = 100000000;
  assert.equal(calc('attorney-article14-stage-investigation', { amount: total }).fee, 50000000);
  assert.equal(calc('attorney-article14-stage-trial', { amount: total }).fee, 30000000);
  assert.equal(calc('attorney-article14-stage-appeal', { amount: total }).fee, 20000000);
  assert.equal(calc('attorney-article14-stage-trial-without-prosecution', { amount: total }).fee, 80000000);
});
test('ماده ۱۴ تبصرهٔ ۳: ۱۰ م با یک جرم = ۱۰ م؛ با سه جرم = ۱۴ م (۲۰٪ × ۲ جرم اضافه)؛ تعداد نامعتبر رد می‌شود', () => {
  assert.equal(calc('attorney-article14-multiple-charges', { amount: 10000000, count: 1 }).fee, 10000000);
  assert.equal(calc('attorney-article14-multiple-charges', { amount: 10000000, count: 3 }).fee, 14000000);
  assert.equal(calc('attorney-article14-multiple-charges', { amount: 10000000, count: 0 }).error, 'INVALID_COUNT');
  assert.equal(calc('attorney-article14-multiple-charges', { amount: 10000000, count: 1.5 }).error, 'INVALID_COUNT');
});

// ---------- ماده ۱۸، ۱۹ ----------
test('ماده ۱۸: یک‌دوم حق‌الوکالهٔ پیش از نقض؛ ۳۰ م ⇒ ۱۵ م', () => {
  assert.equal(calc('attorney-article18-after-reversal', { amount: 30000000 }).fee, 15000000);
});
test('ماده ۱۹: حداکثر ۲۰ م؛ مبلغ بالاتر به سقف می‌رسد و مبلغ کمتر بدون تغییر می‌ماند', () => {
  assert.equal(calc('attorney-article19-prosecution-cap', { amount: 25000000 }).fee, 20000000);
  assert.equal(calc('attorney-article19-prosecution-cap', { amount: 15000000 }).fee, 15000000);
  assert.equal(calc('attorney-article19-prosecution-cap', { amount: 0 }).fee, 0);
});

// ---------- ماده ۲۰ ----------
test('ماده ۲۰: دیوان عدالت اداری ۴ م تا ۵۰۰ م؛ مراجع غیرقضایی ۴ م تا ۲۰۰ م', () => {
  assert.deepEqual([R('attorney-article20-administrative').min, R('attorney-article20-administrative').max], [4000000, 500000000]);
  assert.deepEqual([R('attorney-article20-non-judicial').min, R('attorney-article20-non-judicial').max], [4000000, 200000000]);
});

// ---------- ماده ۲۱ ----------
test('ماده ۲۱: از ۱۰۰ م، ۶۰ م به نخستین و ۴۰ م به تجدیدنظر', () => {
  assert.equal(calc('attorney-article21-first-stage', { amount: 100000000 }).fee, 60000000);
  assert.equal(calc('attorney-article21-appeal-stage', { amount: 100000000 }).fee, 40000000);
});

// ---------- ماده ۲۲ ----------
test('ماده ۲۲ تبصره: گواهی تخصصی ۱۰٪ بر حق‌الوکاله؛ ۱۰ م ⇒ ۱۱ م', () => {
  assert.equal(calc('attorney-article22-specialty', { amount: 10000000 }).fee, 11000000);
});

// ---------- ماده ۲۴ ----------
test('ماده ۲۴: تشخیصی؛ هیچ مبلغی تولید نمی‌شود', () => {
  assert.equal(calc('attorney-article24-withdrawal', { amount: 10000000 }).error, 'RULE_UNVERIFIED');
});

// ---------- ماده ۲۵ ----------
test('ماده ۲۵: هر دو بند بازه‌اند؛ بند حکم ۴ م و سقف ۲٪؛ بند دیگر ۴ م تا ۱۵۰ م', () => {
  const judgment = R('attorney-article25-enforcement-judgment');
  assert.equal(judgment.min, 4000000);
  assert.equal(judgment.maxPercent, 2);
  assert.equal(applyRule(judgment, { amount: 1000000000 }).error, 'RULE_UNVERIFIED');
  const other = R('attorney-article25-enforcement');
  assert.deepEqual([other.min, other.max], [4000000, 150000000]);
});

// ---------- ماده ۲۶ ----------
test('ماده ۲۶ بند الف: حداکثر ۵۰ م؛ ۸۰ م ⇒ ۵۰ م و ۲۰ م ⇒ ۲۰ م', () => {
  assert.equal(calc('attorney-article26-drafting-cap', { amount: 80000000 }).fee, 50000000);
  assert.equal(calc('attorney-article26-drafting-cap', { amount: 20000000 }).fee, 20000000);
});
test('ماده ۲۶ بندهای ب و ت: مشاوره ۵۰۰ هزار تا ۵ م به ازای ساعت؛ مطالعه ۲ م تا ۵۰ م', () => {
  assert.deepEqual([R('attorney-article26-consultation-hourly').min, R('attorney-article26-consultation-hourly').max], [500000, 5000000]);
  assert.deepEqual([R('attorney-article26-file-study').min, R('attorney-article26-file-study').max], [2000000, 50000000]);
});

// ---------- ماده ۲۸ ----------
test('ماده ۲۸: ۱۰ م تا ۲۵۰ م', () => {
  assert.deepEqual([R('attorney-article28-other').min, R('attorney-article28-other').max], [10000000, 250000000]);
});

// ---------- ماده ۳۰ ----------
test('ماده ۳۰: فوق‌العاده روزانه ۱٬۵۰۰٬۰۰۰ داخل استان و ۳٬۰۰۰٬۰۰۰ خارج استان؛ ۳ روز داخل = ۴٬۵۰۰٬۰۰۰، ۲ روز خارج = ۶٬۰۰۰٬۰۰۰', () => {
  assert.equal(calc('attorney-article30-travel-in-province', { amount: 3 }).fee, 4500000);
  assert.equal(calc('attorney-article30-travel-out-of-province', { amount: 2 }).fee, 6000000);
  assert.equal(calc('attorney-article30-travel-in-province', { amount: 0 }).fee, 0);
});
test('ماده ۳۰: روز کسری یا منفی رد می‌شود', () => {
  assert.equal(calc('attorney-article30-travel-in-province', { amount: 1.5 }).error, 'INVALID_UNITS');
  assert.equal(calc('attorney-article30-travel-out-of-province', { amount: -1 }).error, 'INVALID_UNITS');
});

// ---------- مرزها و ورودی‌های نامعتبر ----------
test('ورودی ناقص یا نامعتبر در قواعد محاسبه‌شده، خطای صریح می‌دهد و مبلغ نمی‌سازد', () => {
  assert.equal(calc('attorney-article12-dismissal-after-answer', { amount: NaN }).error, 'INVALID_AMOUNT');
  assert.equal(calc('attorney-article12-dismissal-after-answer', { amount: -5 }).error, 'INVALID_AMOUNT');
  assert.equal(calc('attorney-article21-first-stage', {}).error, 'INVALID_AMOUNT');
});

test('گرد کردن: سهم‌ها به ریال کامل گرد می‌شوند و عدد اعشاری نمی‌دهند', () => {
  const r = calc('attorney-article12-dismissal-before-answer', { amount: 10 });
  assert.equal(Number.isInteger(r.fee), true);
  assert.equal(r.fee, 3); // ۱۰ × ۲۵٪ = ۲٫۵ ⇒ ۳ (گرد به نزدیک‌ترین)
});
