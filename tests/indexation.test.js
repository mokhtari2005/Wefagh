// آزمون خسارت تأخیر تأدیه بر اساس شاخص: فرمول، شرایط قانونی، دوره‌های بدون داده و ورودی نامعتبر.
// عددهای مورد انتظار از شاخص‌های گزارش رسمی (تیر ۱۴۰۵ = ۷۴۲٫۸، شهریور ۱۴۰۵ = ۸۰۰٫۰) محاسبه شده‌اند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDelayDamage, periodKeyOfIso, INDEXATION_CONDITIONS } from '../site/js/calc/indexation.js';

const ALL = Object.fromEntries(INDEXATION_CONDITIONS.map((c) => [c.id, true]));

test('تبدیل تاریخ میلادی به ماه شمسی درست است', () => {
  assert.equal(periodKeyOfIso('2026-06-22'), '1405-04'); // اول تیر ۱۴۰۵
  assert.equal(periodKeyOfIso('2026-07-22'), '1405-04'); // آخر تیر ۱۴۰۵
  assert.equal(periodKeyOfIso('2026-08-25'), '1405-06'); // شهریور ۱۴۰۵
  assert.equal(periodKeyOfIso('2024-03-20'), '1403-01'); // اول فروردین ۱۴۰۳
});

test('فرمول: ۱۰۰ میلیون از تیر تا شهریور ۱۴۰۵ = ۱۰۰ × (۸۰۰٫۰ ÷ ۷۴۲٫۸ − ۱) = ۷٬۷۰۰٬۵۹۲ ریال', () => {
  const r = indexedDelayDamage({ principal: 100000000, startIso: '2026-06-22', endIso: '2026-08-25', confirmed: ALL });
  assert.equal(r.ok, true);
  assert.equal(r.interest, 7700592);
  assert.equal(r.total, 107700592);
  assert.equal(r.startIndex.index, 742.8);
  assert.equal(r.endIndex.index, 800);
  assert.match(r.steps.join('|'), /منبع/);
});

test('هم ماه: خسارت صفر است؛ پایان قبل از شروع رد می‌شود', () => {
  const same = indexedDelayDamage({ principal: 5000000, startIso: '2026-06-22', endIso: '2026-07-10', confirmed: ALL });
  assert.equal(same.interest, 0);
  const reversed = indexedDelayDamage({ principal: 5000000, startIso: '2026-08-25', endIso: '2026-06-22', confirmed: ALL });
  assert.equal(reversed.error, 'INVALID_PERIOD');
});

test('هر شرط تأییدنشده، محاسبه را متوقف می‌کند و شرط را نام می‌برد', () => {
  for (const c of INDEXATION_CONDITIONS) {
    const confirmed = { ...ALL, [c.id]: false };
    const r = indexedDelayDamage({ principal: 1000000, startIso: '2026-06-22', endIso: '2026-08-25', confirmed });
    assert.equal(r.error, 'CONDITIONS_NOT_CONFIRMED', c.id);
    assert.deepEqual(r.missingConditions, [c.label], c.id);
    assert.equal(r.interest, undefined, c.id);
  }
  assert.equal(indexedDelayDamage({ principal: 1, startIso: '2026-06-22', endIso: '2026-08-25', confirmed: {} }).error, 'CONDITIONS_NOT_CONFIRMED');
});

test('دورهٔ بدون شاخص: هیچ عدد تقریبی ساخته نمی‌شود و دورهٔ دارای داده اعلام می‌شود', () => {
  const after = indexedDelayDamage({ principal: 1000000, startIso: '2026-06-22', endIso: '2026-10-28', confirmed: ALL });
  assert.equal(after.error, 'NO_INDEX_DATA');
  assert.deepEqual(after.missingKeys, ['1405-08']);
  assert.deepEqual(after.coverage, { first: '1402-01', last: '1405-06' });
  assert.equal(after.interest, undefined);
  const before = indexedDelayDamage({ principal: 1000000, startIso: '2022-03-21', endIso: '2026-08-25', confirmed: ALL });
  assert.equal(before.error, 'NO_INDEX_DATA');
  assert.deepEqual(before.missingKeys, ['1401-01']);
});

test('ورودی نامعتبر: اصل صفر یا منفی، تاریخ نامعتبر', () => {
  assert.equal(indexedDelayDamage({ principal: 0, startIso: '2026-06-22', endIso: '2026-08-25', confirmed: ALL }).error, 'INVALID_PRINCIPAL');
  assert.equal(indexedDelayDamage({ principal: -5, startIso: '2026-06-22', endIso: '2026-08-25', confirmed: ALL }).error, 'INVALID_PRINCIPAL');
  assert.equal(indexedDelayDamage({ principal: 1, startIso: '', endIso: '2026-08-25', confirmed: ALL }).error, 'INVALID_DATES');
});

test('گرد کردن به ریال کامل: خسارت عدد صحیح است', () => {
  const r = indexedDelayDamage({ principal: 12345679, startIso: '2026-06-22', endIso: '2026-08-25', confirmed: ALL });
  assert.equal(Number.isInteger(r.interest), true);
});
