import test from 'node:test';
import assert from 'node:assert/strict';
import { legalSearchTerms } from '../worker/src/legal-bank.js';
import { buildSafeLegalSearchQuery } from '../worker/src/ai/legal-search.js';

test('جست‌وجوی بانک قوانین موضوع شارژ ساختمان و بستن پارکینگ را به قواعد مرتبط گسترش می‌دهد', () => {
  const terms = legalSearchTerms('شارژ آپارتمانم را ندادم در پارکینکم را بستند');
  assert.ok(terms.includes('قانون تملک آپارتمان‌ها'));
  assert.ok(terms.includes('آیین‌نامه اجرایی قانون تملک آپارتمان‌ها'));
  assert.ok(terms.includes('هزینه‌های مشترک'));
  assert.ok(terms.includes('پارکینگ'));
  assert.ok(terms.includes('ماده ۱۰ مکرر'));
});

test('جست‌وجوی برخط برای اختلافات شارژ و پارکینگ، محورهای قانونی مرتبط را جست‌وجو می‌کند', () => {
  const query = buildSafeLegalSearchQuery('شارژ آپارتمانم را ندادم در پارکینکم را بستند');
  assert.match(query, /قانون تملک آپارتمان‌ها/u);
  assert.match(query, /آیین‌نامه اجرایی قانون تملک آپارتمان‌ها/u);
  assert.match(query, /پارکینگ اختصاصی و مشاعات/u);
});
