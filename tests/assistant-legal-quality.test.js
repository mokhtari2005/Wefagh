import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prompt = readFileSync(new URL('../worker/src/ai/prompts.js', import.meta.url), 'utf8');

test('پروتکل کنترل استناد حقوقی در دستور سیستمی ثبت شده است', () => {
  assert.match(prompt, /پروتکل اجباری کنترل استناد در همه پاسخ‌های حقوقی/u);
  assert.match(prompt, /عنوان و تاریخ تصویب قانون یا مقرره/u);
  assert.match(prompt, /شماره ماده و موضوع واقعی همان ماده/u);
  assert.match(prompt, /اعتبار زمانی/u);
  assert.match(prompt, /ارتباط مستقیم ماده با گزاره/u);
  assert.match(prompt, /صلاحیت مرجع و تشریفات قانونی جاری/u);
  assert.match(prompt, /مواد نامرتبط اضافه نکن/u);
});

test('نمونه شارژ ساختمان به‌عنوان آزمون رگرسیون حقوقی پوشش داده شده است', () => {
  assert.match(prompt, /قانون تملک آپارتمان‌ها مصوب ۱۳۴۳ با اصلاحات بعدی/u);
  assert.match(prompt, /ماده ۴ این قانون مبنای مشارکت در هزینه‌های مشترک/u);
  assert.match(prompt, /ماده ۱۰ مکرر مسیر اختصاصی مطالبه و ضمانت‌اجرا/u);
  assert.match(prompt, /مهلت ده‌روزه از تاریخ ابلاغ/u);
  assert.match(prompt, /تبصره ۱ ماده ۱۰ مکرر/u);
  assert.match(prompt, /ماده ۲۲ آیین‌نامه اجرایی قانون تملک آپارتمان‌ها/u);
  assert.match(prompt, /ماده ۳۰۶ قانون آیین دادرسی مدنی مربوط به واخواهی از حکم غیابی/u);
  assert.match(prompt, /مواد ۳۳۶ و ۴۴۳ تا ۴۴۵/u);
  assert.match(prompt, /مسئولیت مالک و استفاده‌کننده\/مستأجر/u);
  assert.match(prompt, /قانون جاری شوراهای حل اختلاف و صلاحیت دادگاه صلح/u);
});
