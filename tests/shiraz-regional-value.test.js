import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIRAZ_BLOCKS } from '../site/js/calc/shiraz-1405-data.js';

test('دفترچه ارزش معاملاتی ۱۴۰۵ شامل ۲۰۶ بلوک مناطق ۱۱گانه شیراز است', () => {
  assert.equal(SHIRAZ_BLOCKS.length, 206);
  assert.deepEqual([...new Set(SHIRAZ_BLOCKS.map(x => x[0]))], [1,2,3,4,5,6,7,8,9,10,11]);
  assert.equal(new Set(SHIRAZ_BLOCKS.map(x => x[1])).size, 206);
});

test('ارزش بلوک ۱-۱ با جدول صفحه ۲۰ دفترچه منطبق است', () => {
  assert.deepEqual(SHIRAZ_BLOCKS.find(x => x[1] === '1-1'), [1,'1-1',18000000,65400000,29800000]);
});

test('همه نرخ‌های عرصه در داده‌ها مثبت و ریالی هستند', () => {
  for (const row of SHIRAZ_BLOCKS) {
    assert.ok(row.slice(2).every(value => Number.isInteger(value) && value > 0));
  }
});
