import test from 'node:test';
import assert from 'node:assert/strict';
import { findVerifiedJudicialAuthorities } from '../worker/src/legal-bank.js';
import { buildSafeLegalSearchQuery, retrieveOfficialPageText } from '../worker/src/ai/legal-search.js';
import { reviewLegalDraft, GROQ_API } from '../worker/src/ai/groq.js';

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('بازیابی قضایی فقط رکوردهای دارای متن کامل و وضعیت تأییدشده را هدف می‌گیرد', async () => {
  let captured;
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        return { all: async () => {
          captured = { sql, bindings };
          return { results: [{
            lawTitle: 'رأی وحدت رویه هیأت عمومی دیوان عالی کشور',
            lawType: 'supreme_court_unified_precedent',
            documentNumber: '۸۵۸',
            documentDate: '۱۴۰۳/۰۸/۱۵',
            issuingAuthority: 'هیأت عمومی دیوان عالی کشور',
            body: 'متن کامل رأی نمونه',
          }] };
        } };
      } };
    },
  };
  const found = await findVerifiedJudicialAuthorities(db, 'رأی وحدت رویه شماره ۸۵۸ درباره توقیف مال');
  assert.equal(found[0].documentNumber, '۸۵۸');
  assert.equal(found[0].lawType, 'supreme_court_unified_precedent');
  assert.match(captured.sql, /l.status='verified' AND a.status='verified'/);
  assert.match(captured.sql, /l.law_type IN/);
  assert.match(captured.sql, /l.document_number LIKE/);
  assert.ok(captured.bindings.length > 0);
});

test('پرس‌وجوی برخط فقط واژگان حقوقی مجاز و ارجاع دقیق ماده را می‌فرستد', () => {
  const query = buildSafeLegalSearchQuery('در انتقال مال توقیف‌شده، ماده ۵۶ قانون اجرای احکام مدنی و رأی وحدت رویه و نظریه مشورتی مرتبط چیست؟ نام شخص محرمانه و شماره پرونده ۱۲۳۴');
  assert.match(query, /قانون اجرای احکام مدنی ماده 56/);
  assert.match(query, /آرای وحدت رویه دیوان عالی کشور/);
  assert.match(query, /نظریات مشورتی اداره کل حقوقی قوه قضاییه/);
  assert.doesNotMatch(query, /محرمانه|۱۲۳۴/);
});

test('متن مستقیم فقط از دامنه رسمی مجاز خوانده می‌شود و تغییرمسیر دنبال نمی‌شود', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('<html><body><h1>قانون اجرای احکام مدنی</h1><p>' + 'متن رسمی قانون '.repeat(30) + 'ماده ۵۶ در متن صفحه رسمی آمده است.</p></body></html>', {
      status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
  try {
    const result = await retrieveOfficialPageText([
      { title: 'قانون', uri: 'https://qavanin.ir/law/56', domain: 'qavanin.ir' },
      { title: 'غیررسمی', uri: 'https://example.com/law', domain: 'example.com' },
    ]);
    assert.equal(result[0].pageTextStatus, 'official_domain_page_text_retrieved');
    assert.match(result[0].pageText, /ماده ۵۶/);
    assert.equal(result[1].pageTextStatus, 'not_primary_source_domain');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'manual');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('بازبین مستقل متن کامل رأی تأییدشده و صفحه رسمی بازیابی‌شده را دریافت می‌کند', async () => {
  const originalFetch = globalThis.fetch;
  const key = 'groq-test-key-0123456789';
  const reviewJson = { risk: 'low', summary: 'منبع از حیث هویت و متن در زمینه موجود است.', issues: [], citations: [] };
  let submitted = '';
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), GROQ_API);
    const payload = JSON.parse(init.body);
    submitted = payload.messages[1].content;
    return jsonRes(200, { choices: [{ message: { content: JSON.stringify(reviewJson) } }] });
  };
  try {
    const result = await reviewLegalDraft({ GROQ_API_KEY: key }, {
      mode: 'consult',
      question: 'رأی وحدت رویه مرتبط با توقیف مال چیست؟',
      draft: 'پاسخ با استناد به رأی وحدت رویه شماره ۸۵۸.',
      legalArticles: [{
        lawTitle: 'رأی وحدت رویه هیأت عمومی دیوان عالی کشور',
        lawType: 'supreme_court_unified_precedent',
        documentNumber: '۸۵۸',
        documentDate: '۱۴۰۳/۰۸/۱۵',
        issuingAuthority: 'هیأت عمومی دیوان عالی کشور',
        body: 'متن کامل رأی نمونه',
        sourceName: 'منبع رسمی',
        officialSourceUrl: 'https://example.gov.ir/judgment/858',
      }],
      webSources: [{
        title: 'صفحه رسمی قانون',
        uri: 'https://qavanin.ir/law/56',
        domain: 'qavanin.ir',
        pageTextStatus: 'official_domain_page_text_retrieved',
        pageText: 'ماده ۵۶ در متن صفحه رسمی',
      }],
    });
    assert.equal(result.status, 'reviewed');
    assert.equal(result.bankArticlesCount, 1);
    assert.equal(result.webSourcesCount, 1);
    assert.match(submitted, /شماره سند: ۸۵۸/);
    assert.match(submitted, /متن کامل رأی نمونه/);
    assert.match(submitted, /official_domain_page_text_retrieved/);
    assert.match(submitted, /ماده ۵۶ در متن صفحه رسمی/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
