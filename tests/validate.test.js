import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContact, cleanText, cleanMultiline } from '../worker/src/validate.js';

const valid = {
  name: 'علی رضایی',
  email: 'Test@Example.com',
  topic: 'consulting',
  message: 'سلام، درباره مشاوره حقوقی سوال دارم.',
};

test('ورودی معتبر پذیرفته و ایمیل به حروف کوچک تبدیل می‌شود', () => {
  const r = validateContact(valid);
  assert.equal(r.ok, true);
  assert.equal(r.value.email, 'test@example.com');
  assert.equal(r.value.topic, 'consulting');
});

test('موضوع خالی به general تبدیل می‌شود', () => {
  const r = validateContact({ ...valid, topic: '' });
  assert.equal(r.ok, true);
  assert.equal(r.value.topic, 'general');
});

test('ایمیل نامعتبر رد می‌شود', () => {
  const r = validateContact({ ...valid, email: 'not-an-email' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.email);
});

test('موضوع ناشناخته رد می‌شود', () => {
  const r = validateContact({ ...valid, topic: 'hacking' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.topic);
});

test('نام خیلی کوتاه و پیام خیلی کوتاه خطا می‌دهند', () => {
  const r = validateContact({ ...valid, name: 'ا', message: 'کوتاه' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name);
  assert.ok(r.errors.message);
});

test('پیام بیش از حد طولانی رد می‌شود', () => {
  const r = validateContact({ ...valid, message: 'ا'.repeat(2001) });
  assert.equal(r.ok, false);
  assert.ok(r.errors.message);
});

test('بدنهٔ غیرشیء و آرایه رد می‌شود', () => {
  assert.equal(validateContact(null).ok, false);
  assert.equal(validateContact([]).ok, false);
  assert.equal(validateContact('x').ok, false);
});

test('کاراکترهای کنترلی حذف می‌شوند و فاصله‌ها جمع می‌شوند', () => {
  assert.equal(cleanText('  علی\u0000   رضایی  '), 'علی رضایی');
  assert.equal(cleanMultiline('خط اول\r\nخط دوم\u0007'), 'خط اول\nخط دوم');
});
