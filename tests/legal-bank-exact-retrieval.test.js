import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExplicitLegalReferences, findVerifiedLegalArticles } from '../worker/src/legal-bank.js';

const exactArticle = {
  lawTitle: 'قانون اجرای احکام مدنی',
  articleNumber: '۵۶',
  body: 'متن دقیق ماده ۵۶',
};
const keywordArticle = {
  lawTitle: 'قانون مدنی',
  articleNumber: '۱۰',
  body: 'نتیجه‌ای با واژه‌های مشترک موضوع',
};

function mockDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            all: async () => {
              calls.push({ sql, bindings });
              return { results: sql.includes('a.article_number IN')
                ? [exactArticle]
                : [keywordArticle] };
            },
          };
        },
      };
    },
  };
}

test('استناد صریح ماده و قانون پیش از نتایج واژگانی بازیابی می‌شود', async () => {
  const db = mockDb();
  const results = await findVerifiedLegalArticles(
    db,
    'مطابق ماده ۵۶ قانون اجرای احکام مدنی، انتقال مال توقیف‌شده باطل است.',
  );

  assert.equal(db.calls.length, 2);
  assert.match(db.calls[0].sql, /a\.article_number IN/u);
  assert.ok(db.calls[0].bindings.includes('%قانون اجرای احکام مدنی%'));
  assert.ok(db.calls[0].bindings.includes('56'));
  assert.ok(db.calls[0].bindings.includes('۵۶'));
  assert.equal(results[0], exactArticle);
  assert.equal(results.some((item) => item === keywordArticle), true);
});

test('مواد متعدد در یک ارجاع صریح به‌صورت جداگانه استخراج می‌شوند', () => {
  const refs = extractExplicitLegalReferences('مواد ۵۶ و ۵۷ قانون اجرای احکام مدنی قابل بررسی است.');
  assert.deepEqual(refs, [
    { lawTitle: 'قانون اجرای احکام مدنی', articleNumber: '56' },
    { lawTitle: 'قانون اجرای احکام مدنی', articleNumber: '57' },
  ]);
});

test('در نبود استناد صریح، جست‌وجوی واژگانی قبلی بدون تغییر اجرا می‌شود', async () => {
  const db = mockDb();
  const results = await findVerifiedLegalArticles(db, 'شارژ ساختمان و بستن پارکینگ اختصاصی');
  assert.equal(db.calls.length, 1);
  assert.doesNotMatch(db.calls[0].sql, /a\.article_number IN/u);
  assert.equal(results[0], keywordArticle);
});

test('شماره مواد مکرر در استناد صریح حفظ می‌شود', () => {
  const refs = extractExplicitLegalReferences('ماده ۱۰ مکرر قانون تملک آپارتمان‌ها قابل اعمال است.');
  assert.deepEqual(refs, [
    { lawTitle: 'قانون تملک آپارتمان‌ها', articleNumber: '10 مکرر' },
  ]);
});
