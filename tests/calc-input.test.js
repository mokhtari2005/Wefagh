import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strictNumber, deadline, delayInterest } from '../site/js/calc/core.js';
import { tieredFee } from '../site/js/calc/engine.js';

test('خانهٔ خالی یا فاصله عدد نیست و صفر نمی‌شود', () => {
  assert.ok(Number.isNaN(strictNumber('')));
  assert.ok(Number.isNaN(strictNumber('   ')));
  assert.equal(strictNumber(' 12.5 '), 12.5);
  assert.equal(strictNumber(0), 0);
});

test('مهلت بدون تعداد روز پذیرفته نمی‌شود (قبلاً تاریخ ابلاغ را برمی‌گرداند)', () => {
  const r = deadline({ noticeDate: '2026-10-27', days: strictNumber('') });
  assert.equal(r.ok, false);
});

test('نرخ خالی خسارت تأخیر بی‌صدا صفر نمی‌شود', () => {
  const r = delayInterest({ principal: 1000, ratePercent: strictNumber(''), startDate: '2025-01-01', endDate: '2026-01-01' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'INVALID_RATE');
});

test('مبلغ خالی در ماشین‌حساب درصدی رد می‌شود', () => {
  const tiers = [{ upTo: null, percent: 10 }];
  assert.equal(tieredFee({ amount: strictNumber(''), tiers, mode: 'whole' }).ok, false);
});

test('محاسبهٔ معتبر همچنان درست است', () => {
  const r = delayInterest({ principal: 1000, ratePercent: strictNumber('18'), startDate: '2025-01-01', endDate: '2026-01-01' });
  assert.equal(r.interest, 180);
  const d = deadline({ noticeDate: '2026-10-27', days: strictNumber('10') });
  assert.equal(d.lastDay, '2026-11-06');
});
