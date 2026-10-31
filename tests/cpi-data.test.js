// آزمون داده‌های شاخص بانک مرکزی: ارقام ثبت‌شده با متن گزارش‌ها مطابقت دارند و ساختار آن‌ها کامل است.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPI_RECORDS, cpiFor } from '../site/js/calc/cpi-data.js';

test('شاخص تیر ۱۴۰۵ و شهریور ۱۴۰۵ همان ارقام متن گزارش‌ها هستند', () => {
  const tir = cpiFor('1405-04');
  const shahrivar = cpiFor('1405-06');
  assert.equal(tir.index, 742.8);
  assert.equal(tir.monthlyChangePct, 3.6);
  assert.equal(tir.yearOverYearChangePct, 83.9);
  assert.equal(tir.twelveMonthChangePct, 61.4);
  assert.equal(shahrivar.index, 800);
  assert.equal(shahrivar.monthlyChangePct, 3.9);
  assert.equal(shahrivar.yearOverYearChangePct, 83.8);
  assert.equal(shahrivar.twelveMonthChangePct, 68.4);
});

test('هر رکورد مبنا، منبع، صفحه و وضعیت بررسی دارد و هیچ شاخص تخمینی وجود ندارد', () => {
  for (const r of CPI_RECORDS) {
    assert.ok(r.period && r.periodKey && r.publishedAt && r.source && r.sourceFile);
    assert.equal(r.base, '۱۴۰۰=۱۰۰');
    assert.ok(Number.isFinite(r.index) && r.index > 0);
    assert.equal(r.status, 'source_read');
  }
  assert.equal(cpiFor('1404-01'), null, 'دورهٔ بدون داده نباید پاسخ داشته باشد');
});
