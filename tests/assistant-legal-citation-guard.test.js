import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardUnverifiedLegalClaims } from '../worker/src/ai/routes.js';

const executionArticle = {
  lawTitle: 'قانون اجرای احکام مدنی',
  articleNumber: '۵۶',
  body: 'هرگونه نقل و انتقال نسبت به مال توقیف‌شده باطل و بلااثر است.',
};
const civilArticle = {
  lawTitle: 'قانون مدنی',
  articleNumber: '۱۰',
  body: 'قراردادهای خصوصی نسبت به کسانی که آن را منعقد نموده‌اند نافذ است.',
};
const laborArticle = {
  lawTitle: 'قانون کار',
  articleNumber: '۱۰',
  body: 'قرارداد کار باید مشتمل بر موارد مقرر باشد.',
};

test('شماره ماده موجود در قانون دیگر، استناد به قانون مدنی را تأیید نمی‌کند', () => {
  const result = guardUnverifiedLegalClaims('به موجب ماده ۵۶ قانون مدنی، انتقال باطل است.', [executionArticle]);
  assert.equal(result.flagged, true);
  assert.match(result.text, /مستند قانونی این ارجاع در منابع تأییدشده این درخواست احراز نشد/);
  assert.doesNotMatch(result.text, /ماده ۵۶ قانون مدنی/);
});

test('استناد صریح با نام قانون درست، حتی با شماره ماده مشترک، حفظ می‌شود', () => {
  const result = guardUnverifiedLegalClaims('مطابق ماده ۱۰ قانون مدنی، قرارداد نافذ است.', [civilArticle, laborArticle]);
  assert.equal(result.flagged, false);
  assert.match(result.text, /ماده ۱۰ قانون مدنی/);
});

test('استناد بدون نام قانون و با شماره مشترک میان چند قانون، تأیید نمی‌شود', () => {
  const result = guardUnverifiedLegalClaims('مطابق ماده ۱۰، قرارداد معتبر است.', [civilArticle, laborArticle]);
  assert.equal(result.flagged, true);
  assert.match(result.text, /مستند قانونی این ارجاع در منابع تأییدشده این درخواست احراز نشد/);
});

test('استناد بدون نام قانون فقط وقتی حفظ می‌شود که در زمینه بازیابی‌شده به یک قانون یکتا تعلق داشته باشد', () => {
  const result = guardUnverifiedLegalClaims('مطابق ماده ۵۶، انتقال مال توقیف‌شده باطل است.', [executionArticle]);
  assert.equal(result.flagged, false);
  assert.match(result.text, /ماده ۵۶/);
});

test('همه مواد یک بازه باید در همان قانون بازیابی شده باشند', () => {
  const result = guardUnverifiedLegalClaims('مواد ۵۶ تا ۵۷ قانون اجرای احکام مدنی قابل اعمال است.', [
    executionArticle,
    { ...executionArticle, articleNumber: '۵۷' },
  ]);
  assert.equal(result.flagged, false);
  assert.match(result.text, /مواد ۵۶ تا ۵۷ قانون اجرای احکام مدنی/);
});
