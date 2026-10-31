// آزمون خسارت تأخیر تأدیه بر اساس شاخص: مقادیر مستقل از شاخص‌های گزارش بانک مرکزی محاسبه شده‌اند.
// پرداخت جزئی، دوره‌های بدون شاخص، و تاریخ‌های نامعتبر صریحاً رد می‌شوند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDelayDamage, planDelayPeriod, periodKeyOfIso, LEGAL_VERIFICATION_POINTS } from '../site/js/calc/indexation.js';

// تاریخ‌های میلادی نمونه (هر کدام در ماه شمسی مشخص‌شده قرار دارد)
const D = { m1399_12: '2021-02-19', m1400_01: '2021-03-21', m1402_02: '2023-04-21', m1403_01: '2024-03-20', m1404_07: '2025-09-23', m1405_06: '2026-08-23', m1405_08: '2026-10-23' };

test('تبدیل تاریخ میلادی به ماه شمسی درست است', () => {
  assert.equal(periodKeyOfIso(D.m1400_01), '1400-01');
  assert.equal(periodKeyOfIso(D.m1405_06), '1405-06');
  assert.equal(periodKeyOfIso('2026-06-22'), '1405-04');
  assert.equal(periodKeyOfIso('2026-07-22'), '1405-04');
});

test('نمونهٔ دوره‌ی پنج‌ساله: ۵۰ میلیون از فروردین ۱۴۰۰ (۸۳٫۳) تا شهریور ۱۴۰۵ (۸۰۰٫۰) = ۴۳۰٬۱۹۲٬۰۷۷ ریال', () => {
  const r = indexedDelayDamage({ principal: 50000000, startIso: D.m1400_01, endIso: D.m1405_06 });
  assert.equal(r.ok, true);
  assert.equal(r.interest, 430192077);
  assert.equal(r.total, 480192077);
  assert.equal(r.startIndex.index, 83.3);
  assert.equal(r.endIndex.index, 800);
});

test('نمونهٔ دوره‌ی میانی: ۲۰ میلیون از اردیبهشت ۱۴۰۲ (۱۹۸٫۸) تا خرداد ۱۴۰۴ (۳۹۱٫۴) = ۱۹٬۳۷۶٬۲۵۸ ریال', () => {
  const r = indexedDelayDamage({ principal: 20000000, startIso: D.m1402_02, endIso: '2025-05-25' });
  assert.equal(r.endIndex.periodKey, '1404-03');
  assert.equal(r.interest, 19376258);
});

test('پرداخت کامل در میانهٔ دوره: پایان محاسبه تاریخ پرداخت است، نه تاریخ محاسبه', () => {
  const plan = planDelayPeriod({ startIso: D.m1403_01, calcIso: D.m1405_06, payment: { status: 'full', dateIso: D.m1404_07 } });
  assert.equal(plan.ok, true);
  assert.equal(plan.endIso, D.m1404_07);
  assert.equal(plan.endBasis, 'تاریخ پرداخت کامل');
  const r = indexedDelayDamage({ principal: 30000000, startIso: D.m1403_01, endIso: plan.endIso });
  assert.equal(r.interest, 22514395);
});

test('پرداخت نشده: پایان محاسبه تاریخ محاسبه است', () => {
  const plan = planDelayPeriod({ startIso: D.m1403_01, calcIso: D.m1405_06, payment: { status: 'unpaid' } });
  assert.equal(plan.endIso, D.m1405_06);
  assert.equal(plan.endBasis, 'تاریخ محاسبه');
});

test('پرداخت جزئی پشتیبانی نمی‌شود و صریحاً رد می‌شود', () => {
  const plan = planDelayPeriod({ startIso: D.m1403_01, calcIso: D.m1405_06, payment: { status: 'partial', dateIso: D.m1404_07 } });
  assert.equal(plan.ok, false);
  assert.equal(plan.error, 'PARTIAL_PAYMENT_UNSUPPORTED');
});

test('پرداخت کامل بدون تاریخ یا وضعیت ناشناخته رد می‌شود', () => {
  assert.equal(planDelayPeriod({ startIso: D.m1403_01, calcIso: D.m1405_06, payment: { status: 'full' } }).error, 'INVALID_DATES');
  assert.equal(planDelayPeriod({ startIso: D.m1403_01, calcIso: D.m1405_06, payment: { status: 'weird' } }).error, 'INVALID_PAYMENT');
});

test('همان ماه: خسارت صفر؛ پایان قبل از شروع رد می‌شود', () => {
  assert.equal(indexedDelayDamage({ principal: 5000000, startIso: D.m1403_01, endIso: '2024-03-25' }).interest, 0);
  assert.equal(indexedDelayDamage({ principal: 5000000, startIso: D.m1405_06, endIso: D.m1403_01 }).error, 'INVALID_PERIOD');
});

test('تاریخ قبل از اولین ماه جدول (۱۳۹۹/۱۲): محاسبه انجام نمی‌شود و جهت خطا مشخص است', () => {
  const r = indexedDelayDamage({ principal: 1000000, startIso: D.m1399_12, endIso: D.m1405_06 });
  assert.equal(r.error, 'NO_INDEX_DATA');
  assert.deepEqual(r.outside, [{ periodKey: '1399-12', side: 'before' }]);
  assert.equal(r.interest, undefined);
});

test('تاریخ بعد از آخرین ماه جدول (مهر ۱۴۰۵): محاسبه انجام نمی‌شود و جهت خطا مشخص است', () => {
  const r = indexedDelayDamage({ principal: 1000000, startIso: D.m1403_01, endIso: D.m1405_08 });
  assert.equal(r.error, 'NO_INDEX_DATA');
  assert.deepEqual(r.outside, [{ periodKey: '1405-08', side: 'after' }]);
  assert.deepEqual(r.coverage, { first: '1400-01', last: '1405-06' });
});

test('ورودی نامعتبر: اصل صفر یا منفی، تاریخ خالی', () => {
  assert.equal(indexedDelayDamage({ principal: 0, startIso: D.m1403_01, endIso: D.m1405_06 }).error, 'INVALID_PRINCIPAL');
  assert.equal(indexedDelayDamage({ principal: -5, startIso: D.m1403_01, endIso: D.m1405_06 }).error, 'INVALID_PRINCIPAL');
  assert.equal(indexedDelayDamage({ principal: 1, startIso: '', endIso: D.m1405_06 }).error, 'INVALID_DATES');
});

test('خروجی شامل شاخص مبدأ و مقصد، ماه مبنا، ضریب، فرمول، منبع و توضیح احراز است', () => {
  const r = indexedDelayDamage({ principal: 50000000, startIso: D.m1400_01, endIso: D.m1405_06, startBasis: 'تاریخ سررسید', endBasis: 'تاریخ محاسبه' });
  assert.equal(r.referenceMonth, 'فروردین ۱۴۰۰');
  assert.match(r.formula, /شاخص ماه پایان/);
  assert.equal(r.ratio.toFixed(4), (800 / 83.3).toFixed(4));
  assert.equal(r.source.reportPublishedAt, 'مهرماه ۱۴۰۵');
  assert.equal(r.source.startPage, 6);
  assert.equal(r.source.endPage, 7);
  assert.equal(r.requiredVerification.length, LEGAL_VERIFICATION_POINTS.length);
  assert.ok(r.requiredVerification.some((p) => p.includes('ماده ۵۲۲')));
});

test('گرد کردن به ریال کامل: خسارت عدد صحیح است', () => {
  const r = indexedDelayDamage({ principal: 12345679, startIso: D.m1403_01, endIso: D.m1405_06 });
  assert.equal(Number.isInteger(r.interest), true);
});
