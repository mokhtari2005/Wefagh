// آزمون داده‌های شاخص بانک مرکزی: ارقام با گزارش‌ها مطابقت دارند، جدول پیوسته است و هیچ ماه تخمینی ندارد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPI_RECORDS, CPI_SOURCE, cpiFor, cpiCoverage } from '../site/js/calc/cpi-data.js';

test('شاخص تیر ۱۴۰۵ و شهریور ۱۴۰۵ همان ارقام متن گزارش‌ها هستند', () => {
  const tir = cpiFor('1405-04');
  const shahrivar = cpiFor('1405-06');
  assert.equal(tir.index, 742.8);
  assert.equal(tir.monthlyChangePct, 3.6);
  assert.equal(tir.yearOverYearChangePct, 83.9);
  assert.equal(shahrivar.index, 800);
  assert.equal(shahrivar.monthlyChangePct, 3.9);
  assert.equal(shahrivar.yearOverYearChangePct, 83.8);
});

test('جدول پیوسته است: از فروردین ۱۴۰۲ تا شهریور ۱۴۰۵، بدون ماه جاافتاده یا تکراری', () => {
  assert.deepEqual(cpiCoverage(), { first: '1402-01', last: '1405-06' });
  assert.equal(CPI_RECORDS.length, 42);
  const keys = CPI_RECORDS.map((r) => r.periodKey);
  assert.equal(new Set(keys).size, keys.length);
  for (let i = 1; i < keys.length; i += 1) {
    const [y1, m1] = keys[i - 1].split('-').map(Number);
    const [y2, m2] = keys[i].split('-').map(Number);
    assert.equal(y2 * 12 + m2, y1 * 12 + m1 + 1, `${keys[i - 1]} → ${keys[i]}`);
  }
});

test('کنترل داخلی: تغییر ماهانه و سالانه هر ماه با شاخص‌های جدول می‌خواند', () => {
  const idx = CPI_RECORDS.map((r) => r.index);
  for (let i = 1; i < CPI_RECORDS.length; i += 1) {
    const monthly = (idx[i] / idx[i - 1] - 1) * 100;
    assert.ok(Math.abs(monthly - CPI_RECORDS[i].monthlyChangePct) <= 0.15, `ماهانه ${CPI_RECORDS[i].periodKey}`);
  }
  for (let i = 12; i < CPI_RECORDS.length; i += 1) {
    const yoy = (idx[i] / idx[i - 12] - 1) * 100;
    assert.ok(Math.abs(yoy - CPI_RECORDS[i].yearOverYearChangePct) <= 0.1, `سالانه ${CPI_RECORDS[i].periodKey}`);
  }
});

test('هر رکورد مبنا، منبع و وضعیت بررسی دارد؛ دورهٔ بدون داده پاسخ ندارد', () => {
  for (const r of CPI_RECORDS) {
    assert.equal(r.base, '۱۴۰۰=۱۰۰');
    assert.equal(r.source, CPI_SOURCE.id);
    assert.equal(r.status, 'source_read');
    assert.ok(Number.isFinite(r.index) && r.index > 0);
  }
  assert.equal(cpiFor('1401-12'), null);
  assert.equal(cpiFor('1405-07'), null, 'ماه‌های بعد از شهریور ۱۴۰۵ داده ندارند');
});
