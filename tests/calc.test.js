import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, deadline, delayInterest, RULE_VERSION } from '../site/js/calc/core.js';
import { scoreRubric, CASE } from '../site/js/moot.js';

test('افزودن روز به تاریخ، از جمله از آخر ماه و سال، درست است', () => {
  assert.equal(addDays('2026-10-27', 5), '2026-11-01');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-10-27', 0), '2026-10-27');
});

test('تاریخ‌های نامعتبر و روز منفی پذیرفته نمی‌شوند', () => {
  assert.equal(addDays('2026-02-30', 1), null);
  assert.equal(addDays('27/10/2026', 1), null);
  assert.equal(addDays('2026-10-27', -1), null);
  assert.equal(addDays('2026-10-27', 1.5), null);
});

test('تعداد روز بین دو تاریخ محاسبه می‌شود', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(daysBetween('2026-10-31', '2026-10-01'), -30);
});

test('مهلت: آخرین روز و مراحل و محدودیت‌ها برگردانده می‌شود', () => {
  const r = deadline({ noticeDate: '2026-10-27', days: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.lastDay, '2026-11-06');
  assert.equal(r.ruleVersion, RULE_VERSION);
  assert.ok(r.steps.length >= 3);
  assert.ok(r.limitations.some((l) => /تعطیلات/.test(l)), 'باید محدودیت تعطیلات را بگوید');
});

test('مهلت با ورودی نامعتبر خطا می‌دهد', () => {
  assert.equal(deadline({ noticeDate: 'bad', days: 5 }).ok, false);
});

test('خسارت تأخیر: اصل × نرخ × روز ÷ ۳۶۵ و مراحل', () => {
  // ۱٬۰۰۰٬۰۰۰ × ۲۰٪ × ۳۶۵ روز ÷ ۳۶۵ = ۲۰۰٬۰۰۰
  const r = delayInterest({ principal: 1000000, ratePercent: 20, startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.equal(r.ok, true);
  assert.equal(r.days, 364);
  assert.equal(r.interest, Math.round((1000000 * 0.2 * 364) / 365));
  assert.equal(r.total, 1000000 + r.interest);
  assert.ok(r.limitations.some((l) => /منبع رسمی/.test(l)));
});

test('خسارت تأخیر: ورودی‌های نامعتبر رد می‌شوند', () => {
  const base = { principal: 1000, ratePercent: 10, startDate: '2026-01-01', endDate: '2026-02-01' };
  assert.equal(delayInterest({ ...base, principal: 0 }).ok, false);
  assert.equal(delayInterest({ ...base, principal: -5 }).ok, false);
  assert.equal(delayInterest({ ...base, ratePercent: 150 }).ok, false);
  assert.equal(delayInterest({ ...base, ratePercent: NaN }).ok, false);
  assert.equal(delayInterest({ ...base, endDate: '2025-01-01' }).ok, false);
});

test('موت کورت: امتیاز خودارزیابی درصد درستی دارد', () => {
  assert.equal(scoreRubric(3, 6), 50);
  assert.equal(scoreRubric(6, 6), 100);
  assert.equal(scoreRubric(0, 0), 0);
});

test('موت کورت: پرونده فرضی سه مسئله و چک‌لیست دارد', () => {
  assert.equal(CASE.issues.length, 3);
  assert.ok(CASE.rubric.length >= 5);
  assert.match(CASE.title, /فرضی/);
});
