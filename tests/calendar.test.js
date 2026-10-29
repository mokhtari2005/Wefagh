import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shamsiMonth } from '../site/js/calendar.js';

test('ماه آبان ۱۴۰۵ از جمعه ۲۳ اکتبر ۲۰۲۶ شروع و ۳۰ روز دارد', () => {
  const m = shamsiMonth('2026-10-27');
  const days = m.cells.filter((c) => c.iso);
  assert.equal(days.length, 30);
  assert.equal(days[0].iso, '2026-10-23');
  assert.equal(days.at(-1).iso, '2026-11-21');
  // شنبه‌شروع: ۲۳ اکتبر جمعه است، پس شش خانهٔ خالی قبلش باشد
  assert.equal(m.cells.findIndex((c) => c.iso), 6);
});

test('ماه قبل و بعد به روز آخر ماه قبل و روز بعد از آخر ماه اشاره می‌کنند', () => {
  const m = shamsiMonth('2026-10-27');
  assert.equal(m.prevIso, '2026-10-22');
  assert.equal(m.nextIso, '2026-11-22');
});

test('شمارهٔ کل خانه‌ها مضرب ۷ است', () => {
  for (const iso of ['2026-03-21', '2026-10-27', '2027-02-10']) {
    assert.equal(shamsiMonth(iso).cells.length % 7, 0, iso);
  }
});
