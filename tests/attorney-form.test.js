// آزمون محاسبهٔ فرم حق‌الوکاله. مقدارهای مورد انتظار از متن تعرفه (فایل fd69f537) و محاسبهٔ دستی گرفته شده‌اند، نه از خروجی کد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';

const base = { subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 40000000 };

test('ماده ۹ بند الف تا ث: بهای خواسته ۴۰ میلیون ریال، ۸٪ = ۳٬۲۰۰٬۰۰۰ ریال', () => {
  const r = computeAttorneyForm(base);
  assert.equal(r.ok, true);
  assert.equal(r.total, 3200000);
});

test('ماده ۹ بند الف تا ث: پلهٔ دوم، ۱ میلیارد ریال = ۴۰ میلیون (۸٪ تا ۵۰۰ م) + ۳۵ میلیون (۷٪ از ۵۰۰ م) = ۷۵٬۰۰۰٬۰۰۰ ریال', () => {
  assert.equal(computeAttorneyForm({ ...base, amount: 1000000000 }).total, 75000000);
});

test('ماده ۹ (۱۰٪): حکم قطعی از حیث بهای خواسته، ۴۰ میلیون = ۴٬۰۰۰٬۰۰۰ ریال', () => {
  assert.equal(computeAttorneyForm({ ...base, judgment: 'final' }).total, 4000000);
});

test('ماده ۱۲ بند الف: ابطال دادخواست پیش از پاسخ = یک‌چهارم حق‌الوکالهٔ مرحلهٔ نخستین (۳٬۲۰۰٬۰۰۰ × ۱/۴ = ۸۰۰٬۰۰۰)', () => {
  const r = computeAttorneyForm({ ...base, result: 'dismissBefore' });
  assert.equal(r.total, 800000);
  assert.equal(r.lines[0].amount, 3200000, 'مبنای سهم، حق‌الوکالهٔ مرحلهٔ نخستین است');
});

test('ماده ۱۲ بند ب: رد دادخواست پس از پاسخ = یک‌دوم (۳٬۲۰۰٬۰۰۰ × ۱/۲ = ۱٬۶۰۰٬۰۰۰)', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'dismissAfter' }).total, 1600000);
});

test('ماده ۱۲ بند پ: عدم استماع یا رد به علل مرور زمان، امر مختوم یا رد اعاده دادرسی = تمام حق‌الوکاله (۳٬۲۰۰٬۰۰۰)', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'dismissOther' }).total, 3200000);
});

test('ماده ۱۲ بند ت: سقوط تجدیدنظر پیش از پاسخ = یک‌چهارم حق‌الوکالهٔ مرحلهٔ تجدیدنظر (۱۰٬۰۰۰٬۰۰۰ × ۱/۴ = ۲٬۵۰۰٬۰۰۰)', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'appealBefore', appealBase: 10000000 }).total, 2500000);
});

test('ماده ۱۲ بند ث: سقوط تجدیدنظر پس از پاسخ = یک‌دوم حق‌الوکالهٔ مرحلهٔ تجدیدنظر (۱۰٬۰۰۰٬۰۰۰ × ۱/۲ = ۵٬۰۰۰٬۰۰۰)', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'appealAfter', appealBase: 10000000 }).total, 5000000);
});

test('ماده ۲۲ تبصره: گواهی تخصصی ۱۰٪ افزوده می‌کند (۳٬۲۰۰٬۰۰۰ + ۳۲۰٬۰۰۰ = ۳٬۵۲۰٬۰۰۰)', () => {
  const r = computeAttorneyForm({ ...base, specialty: true });
  assert.equal(r.total, 3520000);
  assert.equal(r.lines.at(-1).amount, 320000);
});

test('ماده ۱۸: پس از نقض رأی یک‌دوم حق‌الوکالهٔ پیش از نقض (۳٬۲۰۰٬۰۰۰ × ۱/۲ = ۱٬۶۰۰٬۰۰۰)', () => {
  assert.equal(computeAttorneyForm({ ...base, afterReversal: true }).total, 1600000);
});

test('ماده ۳۰: ۵ روز داخل استان × ۱٬۵۰۰٬۰۰۰ + ۳ روز خارج استان × ۳٬۰۰۰٬۰۰۰ = ۱۶٬۵۰۰٬۰۰۰؛ جمع با حق‌الوکاله ۱۹٬۷۰۰٬۰۰۰', () => {
  const r = computeAttorneyForm({ ...base, inProvinceDays: 5, outProvinceDays: 3 });
  assert.equal(r.feeTotal, 3200000);
  assert.equal(r.travelTotal, 16500000);
  assert.equal(r.total, 19700000);
});

test('ماده ۳۰: فقط یک روز خارج استان = ۳٬۰۰۰٬۰۰۰ ریال', () => {
  assert.equal(computeAttorneyForm({ ...base, outProvinceDays: 1 }).travelTotal, 3000000);
});

test('تمبر مالیاتی (کانون و مرکز): محاسبه نمی‌شود، چون مبنای تمبر در فایل تعرفه نیست', () => {
  assert.equal(computeAttorneyForm({ ...base, subject: 'tax-kanon' }).error, 'TAX_NOT_COMPUTED');
  assert.equal(computeAttorneyForm({ ...base, subject: 'tax-markaz' }).error, 'TAX_NOT_COMPUTED');
});

test('ماده ۸: وکیل تسخیری یا معاضدتی محاسبه نمی‌شود، چون حداقل تعرفه تعریف نشده است', () => {
  assert.equal(computeAttorneyForm({ ...base, temporary: true }).error, 'ART8_UNDEFINED');
});

test('ماده ۱۳: امور حسبی و خانوادگی، عدد قطعی نمی‌دهد و بازه ۵ تا ۲۰۰ و ۴ تا ۳۰۰ میلیون ریال را نشان می‌دهد', () => {
  const r = computeAttorneyForm({ ...base, caseType: 'family' });
  assert.equal(r.error, 'RANGE_ONLY');
  assert.deepEqual(r.ranges.map((g) => [g.min, g.max]), [[5000000, 200000000], [4000000, 300000000]]);
});

test('ماده ۱۴: کیفری عدد قطعی نمی‌دهد و پنج بازهٔ ماده ۱۴ را نشان می‌دهد', () => {
  const r = computeAttorneyForm({ ...base, caseType: 'criminal' });
  assert.equal(r.error, 'RANGE_ONLY');
  assert.equal(r.ranges.length, 5);
  assert.deepEqual(r.ranges[0] && [r.ranges[0].min, r.ranges[0].max], [10000000, 2000000000]);
});

test('ماده ۲۸: سایر موارد، بازهٔ ۱۰ تا ۲۵۰ میلیون ریال', () => {
  const r = computeAttorneyForm({ ...base, caseType: 'other' });
  assert.deepEqual([r.ranges[0].min, r.ranges[0].max], [10000000, 250000000]);
});

test('ماده ۱۲ بند ج: اعتراض به قرار حقوقی، بازهٔ ۱ تا ۱۰۰ میلیون ریال', () => {
  const r = computeAttorneyForm({ ...base, result: 'interlocutory' });
  assert.equal(r.error, 'RANGE_ONLY');
  assert.deepEqual([r.ranges[0].min, r.ranges[0].max], [1000000, 100000000]);
});

test('دعوای مالی بدون نوع حکم، محاسبه نمی‌شود', () => {
  assert.equal(computeAttorneyForm({ ...base, judgment: '' }).error, 'JUDGMENT_REQUIRED');
});

test('بهای خواسته صفر یا منفی پذیرفته نمی‌شود', () => {
  assert.equal(computeAttorneyForm({ ...base, amount: 0 }).error, 'INVALID_AMOUNT');
  assert.equal(computeAttorneyForm({ ...base, amount: -5 }).error, 'INVALID_AMOUNT');
});

test('سقوط تجدیدنظر بدون حق‌الوکالهٔ مرحلهٔ تجدیدنظر، محاسبه نمی‌شود', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'appealBefore' }).error, 'INVALID_APPEAL_BASE');
});

test('ختم دعوا و نقض رأی با هم محاسبه نمی‌شوند', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'dismissAfter', afterReversal: true }).error, 'COMBINED_UNSUPPORTED');
});

test('نتیجهٔ ختم دعوایی که در متن تعرفه نیست، پذیرفته نمی‌شود', () => {
  assert.equal(computeAttorneyForm({ ...base, result: 'unsupported' }).error, 'INVALID_RESULT');
});
