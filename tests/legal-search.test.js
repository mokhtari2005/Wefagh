import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeLegalSearchQuery, extractOfficialGroundedArticleReferences } from '../worker/src/ai/legal-search.js';

test('legal web query contains only whitelisted legal terms', () => {
  const query = buildSafeLegalSearchQuery('نام شخصی محرمانه، شماره پرونده ۱۲۳۴، ماده ۵۶ قانون اجرای احکام مدنی و توقیف ملک');
  assert.equal(query, 'قانون اجرای احکام مدنی ماده 56 توقیف حقوق ایران متن قانون رأی قضایی نظریه مشورتی');
  assert.equal(query.includes('محرمانه'), false);
  assert.equal(query.includes('۱۲۳۴'), false);
});

test('legal web query is empty when no whitelisted legal term exists', () => {
  assert.equal(buildSafeLegalSearchQuery('سلام، درباره موضوعی شخصی سؤال دارم'), '');
});

test('legal term normalization accepts Arabic Yeh and Kaf variants', () => {
  const query = buildSafeLegalSearchQuery('قانون مدني و توقيف');
  assert.equal(query, 'قانون مدنی توقیف حقوق ایران متن قانون رأی قضایی نظریه مشورتی');
});

test('only article numbers cited by official source excerpts pass the citation guard', () => {
  const refs = extractOfficialGroundedArticleReferences([
    { uri: 'https://qavanin.ir/law/1', citedText: 'مواد ۵۶ و ۵۷ قانون اجرای احکام مدنی' },
    { uri: 'https://example.com/law/2', citedText: 'ماده ۹۹ قانون دیگر' },
    { uri: 'https://rrk.ir/law/3', citedText: 'این گزیده شماره ماده ندارد' },
  ]);
  assert.deepEqual(refs, [{ articleNumber: '56' }, { articleNumber: '57' }]);
});
