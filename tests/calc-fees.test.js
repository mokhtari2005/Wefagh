import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentFee, courtFee, attorneyFee } from '../site/js/calc/core.js';

test('درصد ساده بدون کف و سقف', () => {
  const r = percentFee({ amount: 10000000, percent: 3, label: 'x' });
  assert.equal(r.ok, true);
  assert.equal(r.fee, 300000);
});

test('کف، وقتی محاسبه کمتر از کف است، اعمال می‌شود', () => {
  assert.equal(percentFee({ amount: 1000, percent: 1, min: 5000, label: 'x' }).fee, 5000);
});

test('سقف، وقتی محاسبه بیشتر است، اعمال می‌شود', () => {
  assert.equal(percentFee({ amount: 1000000000, percent: 10, max: 20000000, label: 'x' }).fee, 20000000);
});

test('ورودی نامعتبر خطا می‌دهد', () => {
  assert.equal(percentFee({ amount: -1, percent: 1, label: 'x' }).error, 'INVALID_AMOUNT');
  assert.equal(percentFee({ amount: 1, percent: 101, label: 'x' }).error, 'INVALID_RATE');
  assert.equal(percentFee({ amount: 1, percent: 1, min: 10, max: 5, label: 'x' }).error, 'INVALID_MAX');
});

test('هزینهٔ دادرسی و حق‌الوکاله برچسب و محدودیت مخصوص خود را دارند', () => {
  const c = courtFee({ claimAmount: 2000000, percent: 2 });
  assert.equal(c.fee, 40000);
  assert.match(c.steps.at(-1), /هزینه دادرسی/);
  assert.ok(c.limitations.length >= 3);

  const a = attorneyFee({ amount: 5000000, percent: 10, max: 300000 });
  assert.equal(a.fee, 300000);
  assert.match(a.steps.at(-1), /حق‌الوکاله/);
});
