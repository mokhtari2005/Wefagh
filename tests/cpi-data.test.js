// آزمون داده‌های شاخص بانک مرکزی: ارقام با تصویر گزارش شهریور ۱۴۰۵ مطابقت دارند، جدول پیوسته است و ماه تخمینی ندارد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPI_RECORDS, CPI_SOURCE, cpiFor, cpiCoverage } from '../site/js/calc/cpi-data.js';

test('ارقام کلیدی گزارش: فروردین ۱۴۰۰ = ۸۳٫۳، تیر ۱۴۰۵ = ۷۴۲٫۸، شهریور ۱۴۰۵ = ۸۰۰٫۰', () => {
  assert.equal(cpiFor('1400-01').index, 83.3);
  const tir = cpiFor('1405-04');
  assert.equal(tir.index, 742.8);
  assert.equal(tir.monthlyChangePct, 3.6);
  assert.equal(tir.yearOverYearChangePct, 83.9);
  const shahrivar = cpiFor('1405-06');
  assert.equal(shahrivar.index, 800);
  assert.equal(shahrivar.monthlyChangePct, 3.9);
  assert.equal(shahrivar.yearOverYearChangePct, 83.8);
});

test('جدول پیوسته است: از فروردین ۱۴۰۰ تا شهریور ۱۴۰۵، بدون ماه جاافتاده یا تکراری (۶۶ ماه)', () => {
  assert.deepEqual(cpiCoverage(), { first: '1400-01', last: '1405-06' });
  assert.equal(CPI_RECORDS.length, 66);
  const keys = CPI_RECORDS.map((r) => r.periodKey);
  assert.equal(new Set(keys).size, keys.length);
  for (let i = 1; i < keys.length; i += 1) {
    const [y1, m1] = keys[i - 1].split('-').map(Number);
    const [y2, m2] = keys[i].split('-').map(Number);
    assert.equal(y2 * 12 + m2, y1 * 12 + m1 + 1, `${keys[i - 1]} → ${keys[i]}`);
  }
});

test('میانگین سال ۱۴۰۰ برابر مبنا (۱۰۰) است؛ تأیید پایهٔ شاخص', () => {
  const y1400 = CPI_RECORDS.filter((r) => r.periodKey.startsWith('1400-')).map((r) => r.index);
  const avg = y1400.reduce((a, b) => a + b, 0) / y1400.length;
  assert.ok(Math.abs(avg - 100) < 0.05, `میانگین ${avg}`);
});

test('کنترل داخلی: تغییر ماهانه و سالانه، هر جا گزارش رقم دارد، با شاخص‌های جدول می‌خواند', () => {
  const idx = CPI_RECORDS.map((r) => r.index);
  for (let i = 1; i < CPI_RECORDS.length; i += 1) {
    const m = CPI_RECORDS[i].monthlyChangePct;
    if (m !== null) assert.ok(Math.abs((idx[i] / idx[i - 1] - 1) * 100 - m) <= 0.2, `ماهانه ${CPI_RECORDS[i].periodKey}`);
  }
  for (let i = 12; i < CPI_RECORDS.length; i += 1) {
    const y = CPI_RECORDS[i].yearOverYearChangePct;
    if (y !== null) assert.ok(Math.abs((idx[i] / idx[i - 12] - 1) * 100 - y) <= 0.2, `سالانه ${CPI_RECORDS[i].periodKey}`);
  }
});

test('هر ماه منبع، شماره صفحهٔ PDF، شماره صفحهٔ چاپی، تاریخ انتشار و مبنا دارد؛ ماه بدون داده پاسخ ندارد', () => {
  for (const r of CPI_RECORDS) {
    assert.equal(r.base, '۱۴۰۰=۱۰۰');
    assert.equal(r.source, CPI_SOURCE.id);
    assert.equal(r.sourceFile, '1a46bdcb');
    assert.ok([6, 7].includes(r.pdfPage), r.periodKey);
    assert.equal(r.printedPage, r.pdfPage - 1);
    assert.equal(r.publishedAt, 'مهرماه ۱۴۰۵');
    assert.equal(r.status, 'source_read');
    assert.ok(Number.isFinite(r.index) && r.index > 0);
  }
  assert.equal(cpiFor('1399-12'), null, 'قبل از ۱۴۰۰ داده‌ای ثبت نشده است');
  assert.equal(cpiFor('1405-07'), null, 'بعد از شهریور ۱۴۰۵ داده‌ای ثبت نشده است');
});
