import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shamsiToIso, parseShamsiInput, isoToShamsiInput, normalizeDigits } from '../site/js/jalali.js';
import { formatShamsi } from '../site/js/shamsi.js';

test('۵ آبان ۱۴۰۵ ⇄ ۲۷ اکتبر ۲۰۲۶ (هم‌خوان با نمایش)', () => {
  assert.equal(shamsiToIso(1405, 8, 5), '2026-10-27');
  assert.equal(isoToShamsiInput('2026-10-27'), '1405/08/05');
  assert.equal(formatShamsi(new Date('2026-10-27T12:00:00Z')), '۵ آبان ۱۴۰۵');
});

test('اول فروردین ۱۴۰۵ برابر ۲۱ مارس ۲۰۲۶ است', () => {
  assert.equal(shamsiToIso(1405, 1, 1), '2026-03-21');
});

test('ورودی با ارقام فارسی و جداکننده‌های مختلف پذیرفته می‌شود', () => {
  assert.equal(parseShamsiInput('۱۴۰۵/۰۸/۰۶'), '2026-10-28');
  assert.equal(parseShamsiInput('1405-8-6'), '2026-10-28');
  assert.equal(parseShamsiInput(' 1405.08.06 '), '2026-10-28');
});

test('تاریخ‌های نامعتبر رد می‌شوند', () => {
  assert.equal(parseShamsiInput('1405/07/31'), null, 'مهر ۳۰ روز دارد');
  assert.equal(parseShamsiInput('1405/13/01'), null, 'ماه ۱۳ وجود ندارد');
  assert.equal(parseShamsiInput('1405/01/32'), null);
  assert.equal(parseShamsiInput('2026-10-28'), null, 'تاریخ میلادی در ورودی شمسی پذیرفته نمی‌شود');
  assert.equal(parseShamsiInput(''), null);
  assert.equal(parseShamsiInput('abc'), null);
});

test('تبدیل رفت‌وبرگشت برای یک سال کامل', () => {
  for (let jm = 1; jm <= 12; jm += 1) {
    for (let jd = 1; jd <= 30; jd += 1) {
      const iso = shamsiToIso(1404, jm, jd);
      if (iso === null) continue;
      assert.equal(isoToShamsiInput(iso), `1404/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
    }
  }
});

test('normalizeDigits ارقام را تبدیل می‌کند', () => {
  assert.equal(normalizeDigits('۱۴۰۵/۰۸/۰۶'), '1405/08/06');
  assert.equal(normalizeDigits('١٤٠٥'), '1405');
});
