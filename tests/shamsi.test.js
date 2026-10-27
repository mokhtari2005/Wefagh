import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatShamsi } from '../site/js/shamsi.js';

test('۲۷ اکتبر ۲۰۲۶ برابر ۵ آبان ۱۴۰۵ است', () => {
  // ظهر UTC تا در هر منطقهٔ زمانی همان روز تقویمی بماند.
  assert.equal(formatShamsi(new Date('2026-10-27T12:00:00Z')), '۵ آبان ۱۴۰۵');
});

test('اول فروردین ۱۴۰۵ برابر ۲۱ مارس ۲۰۲۶ است', () => {
  assert.equal(formatShamsi(new Date('2026-03-21T12:00:00Z')), '۱ فروردین ۱۴۰۵');
});

test('تاریخ نامعتبر رشتهٔ خالی برمی‌گرداند', () => {
  assert.equal(formatShamsi('not a date'), '');
});

test('خروجی ارقام فارسی دارد', () => {
  assert.match(formatShamsi(new Date('2026-10-27T12:00:00Z')), /[۰-۹]/);
});
