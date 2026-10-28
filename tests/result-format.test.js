import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLimitations, formatNumbersInLine, formatRial, statusLabel } from '../site/js/calc/result-format.js';

test('رشتهٔ تنها یک مورد است، نه فهرست حروف', () => {
  const text = 'این نتیجه بر اساس تأیید کاربر است';
  assert.deepEqual(normalizeLimitations(text), [text]);
});

test('آرایهٔ رشته‌ها به همان موارد کامل تبدیل می‌شود و فاصله‌های اضافه جمع می‌شوند', () => {
  assert.deepEqual(normalizeLimitations(['  اول   مورد ', 'دوم']), ['اول مورد', 'دوم']);
});

test('فهرست خالی، null و موارد خالی حذف می‌شوند', () => {
  assert.deepEqual(normalizeLimitations([]), []);
  assert.deepEqual(normalizeLimitations(null), []);
  assert.deepEqual(normalizeLimitations(['', '  ', undefined, 'معتبر']), ['معتبر']);
});

test('اعداد بزرگ داخل مراحل جداکننده می‌گیرند و عددهای کوچک دست‌نخورده می‌مانند', () => {
  const line = 'بخش 0 تا 150000000 با نرخ 8٪ ⇒ 12000000';
  const out = formatNumbersInLine(line);
  assert.doesNotMatch(out, /\d{4,}/);
  assert.match(out, /۱۵۰٬۰۰۰٬۰۰۰/);
  assert.match(out, /۸٪/);
  assert.doesNotMatch(out, /[0-9]/);
});

test('مبلغ ریالی همیشه واحد صریح دارد', () => {
  assert.equal(formatRial(12000000), `${(12000000).toLocaleString('fa-IR')} ریال`);
  assert.match(formatRial(0), /ریال$/);
});

test('برچسب وضعیت برای هر وضعیت قاعده درست است و تأیید کاربر «غیررسمی» نشان داده می‌شود', () => {
  assert.equal(statusLabel('user_approved').text, 'تأیید کاربر (غیررسمی)');
  assert.equal(statusLabel('text_read').tone, 'warn');
  assert.equal(statusLabel('verified').text, 'احراز شده');
  assert.equal(statusLabel(undefined).text, 'محاسبه‌شده');
});
