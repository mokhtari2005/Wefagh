import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDelayDamage } from '../site/js/calc/indexation.js';

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
    startIso: '2020-03-21',
    endIso: '2021-04-21',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'NO_INDEX_DATA');
});
