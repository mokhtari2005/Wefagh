import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeLegalSearchQuery } from '../worker/src/ai/legal-search.js';

test('legal web query contains only whitelisted legal terms', () => {
  const query = buildSafeLegalSearchQuery('نام شخصی محرمانه، شماره پرونده ۱۲۳۴، ماده ۵۶ قانون اجرای احکام مدنی و توقیف ملک');
  assert.match(query, /قانون اجرای احکام مدنی/u);
  assert.match(query, /ماده 56/u);
  assert.match(query, /قانون ثبت اسناد و املاک/u);
  assert.match(query, /اعتراض ثالث اجرایی/u);
  assert.match(query, /آرای وحدت رویه دیوان عالی کشور/u);
  assert.equal(query.includes('محرمانه'), false);
  assert.equal(query.includes('۱۲۳۴'), false);
});

test('legal web query is empty when no whitelisted legal term exists', () => {
  assert.equal(buildSafeLegalSearchQuery('سلام، درباره موضوعی شخصی سؤال دارم'), '');
});

test('legal term normalization accepts Arabic Yeh and Kaf variants', () => {
  const query = buildSafeLegalSearchQuery('قانون مدني و توقيف');
  assert.match(query, /قانون مدنی/u);
  assert.match(query, /توقیف/u);
  assert.doesNotMatch(query, /مدني|توقيف/u);
});
