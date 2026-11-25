import test from 'node:test';
import assert from 'node:assert/strict';
import { TEHRAN_BLOCKS, TEHRAN_BUILDING_RATES } from '../site/js/calc/tehran-1405-data.js';

test('دفترچه تهران ۱۴۰۵ شامل ۲۲ منطقه و ۲۲۷ بلوک یکتا است', () => {
  assert.equal(TEHRAN_BLOCKS.length, 227);
  assert.deepEqual([...new Set(TEHRAN_BLOCKS.map(x => x[0]))], Array.from({length:22}, (_, i) => i + 1));
  assert.equal(new Set(TEHRAN_BLOCKS.map(x => x[1])).size, 227);
});

test('نرخ‌های بلوک‌های تهران با جدول رسمی ۱۴۰۵ منطبق‌اند', () => {
  assert.deepEqual(TEHRAN_BLOCKS.find(x => x[1] === '1-01'), [1, '1-01', 245000000, 426300000, 343000000]);
  assert.deepEqual(TEHRAN_BLOCKS.find(x => x[1] === '22-05'), [22, '22-05', 118200000, 226100000, 210700000]);
  assert.equal(TEHRAN_BLOCKS.some(x => x[1] === '4-03'), false);
});

test('تمام نرخ‌های عرصه و اعیانی تهران مثبت و ریالی هستند', () => {
  for (const row of TEHRAN_BLOCKS) {
    assert.ok(row.slice(2).every(value => Number.isInteger(value) && value > 0));
  }
  for (const rates of Object.values(TEHRAN_BUILDING_RATES)) {
    assert.ok(Number.isInteger(rates.concrete) && rates.concrete > 0);
    assert.ok(Number.isInteger(rates.other) && rates.other > 0);
  }
});
