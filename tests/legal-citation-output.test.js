import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guardUnverifiedLegalClaims,
  EXECUTION_TRANSFER_ARTICLES,
  CIVIL_PROCEDURE_ARTICLES,
} from '../worker/src/ai/routes.js';
import { groqReviewNotes } from '../worker/src/ai/groq.js';

test('مواد ۵۶ و ۵۷ و ۱۲ از جای‌نگهدار به شماره دقیق تبدیل می‌شوند', () => {
  const source = [
    'معامله مال توقیف‌شده پیش از رفع توقیف، به حکم ماده [شماره نیازمند تطبیق با متن رسمی] قانون اجرای احکام مدنی با ضمانت اجرای بطلان و بلااثری مواجه است.',
    'همچنین، مطابق ماده [شماره نیازمند تطبیق با متن رسمی] قانون اجرای احکام مدنی، قراردادها یا تعهداتی که پس از توقیف مال به زیان محکوم‌له منعقد شوند نافذ نیستند.',
    'در خصوص صلاحیت محلی، مطابق ماده [شماره نیازمند تطبیق با متن رسمی] قانون آیین دادرسی مدنی، دعاوی مربوط به اموال غیرمنقول در دادگاه محل وقوع ملک اقامه می‌شود.',
  ].join(' ');
  const result = guardUnverifiedLegalClaims(source, [
    ...EXECUTION_TRANSFER_ARTICLES,
    ...CIVIL_PROCEDURE_ARTICLES,
  ]);

  assert.match(result.text, /ماده ۵۶ قانون اجرای احکام مدنی/u);
  assert.match(result.text, /ماده ۵۷ قانون اجرای احکام مدنی/u);
  assert.match(result.text, /ماده ۱۲ قانون آیین دادرسی مدنی/u);
  assert.doesNotMatch(result.text, /شماره نیازمند تطبیق/u);
  assert.doesNotMatch(result.text, /ماده ماده/u);
  assert.equal(result.changed, true);
});

test('استناد عددی فاقد پشتوانه همچنان علامت‌گذاری می‌شود', () => {
  const result = guardUnverifiedLegalClaims(
    'مطابق ماده ۹۹ قانون اجرای احکام مدنی، حکم فرضی اجرا می‌شود.',
    [...EXECUTION_TRANSFER_ARTICLES, ...CIVIL_PROCEDURE_ARTICLES],
  );
  assert.match(result.text, /مستند قانونی این ارجاع در منابع تأییدشده این درخواست احراز نشد/u);
  assert.doesNotMatch(result.text, /\[شماره نیازمند تطبیق/u);
  assert.equal(result.changed, true);
});

test('گزارش بازبینی عنوان انگلیسی یا نام مدل را نمایش نمی‌دهد', () => {
  const lines = groqReviewNotes({
    status: 'reviewed',
    model: 'openai/gpt-oss-120b',
    bankArticlesCount: 6,
    review: {
      risk: 'medium',
      summary: 'یک استناد نیازمند بررسی است.',
      issues: [{
        severity: 'medium',
        category: 'MissingLegalReference',
        observation: 'استناد قانونی در منابع موجود تأیید نشده است.',
        recommendation: 'متن مستند قانونی تطبیق شود.',
      }],
      citations: [],
    },
  });
  const output = lines.join('\n');
  assert.match(output, /استناد قانونی تأییدنشده/u);
  assert.doesNotMatch(output, /Groq|openai|gpt-oss|MissingLegalReference|[A-Za-z]/u);
});
