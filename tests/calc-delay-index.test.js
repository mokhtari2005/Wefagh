import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDelayDamage } from '../site/js/calc/indexation.js';
import { cpiFor, cpiAnnualFor } from '../site/js/calc/cpi-data.js';

test('خسارت بر پایه نسبت شاخص سالانه منتشرشده در جدول ماهانه محاسبه می‌شود', () => {
  const result = indexedDelayDamage({
    principal: 1_000_000,
    startIso: '2021-03-21',
    endIso: '2021-04-21',
    startBasis: 'تاریخ سررسید چک',
    endBasis: 'ماه پرداخت',
  });
  assert.equal(result.ok, true);
  assert.equal(result.startIndex.index, 83.3);
  assert.equal(result.endIndex.index, 85);
  assert.equal(result.interest, Math.round(1_000_000 * (85 / 83.3 - 1)));
  assert.match(result.formula, /شاخص سالانه/u);
});

test('دوره فاقد داده شاخص، بدون تخمین رد می‌شود', () => {
  const result = indexedDelayDamage({
    principal: 1_000_000,
    startIso: '1994-03-20',
    endIso: '2021-04-21',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'NO_INDEX_DATA');
});


test('شاخص ماهانه تاریخی سال ۱۳۸۰ به محاسبه‌گر متصل است', () => {
  const start = cpiFor('1380-01');
  const end = cpiFor('1400-01');
  assert.ok(start);
  assert.ok(end);
  assert.equal(start.status, 'historical_rebased');
  assert.equal(start.index, Number((9.1 * 100 / 437.042).toFixed(4)));

  const result = indexedDelayDamage({
    principal: 1_000_000,
    startIso: '2001-03-21',
    endIso: '2021-03-21',
  });
  assert.equal(result.ok, true);
  assert.equal(result.startIndex.periodKey, '1380-01');
  assert.equal(result.endIndex.periodKey, '1400-01');
});

test('شاخص سالانه تاریخی ۱۳۱۵ تا ۱۳۷۲ فقط برای مرجع در دسترس است', () => {
  assert.equal(cpiAnnualFor(1310), null);
  assert.equal(cpiAnnualFor(1315).index, 0.02);
  assert.equal(cpiAnnualFor(1372).index, 12.48);
  assert.equal(cpiFor('1368-01'), null);
});
