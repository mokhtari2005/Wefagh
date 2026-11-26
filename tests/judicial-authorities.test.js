import test from 'node:test';
import assert from 'node:assert/strict';
import { findVerifiedJudicialAuthorities, findVerifiedLegalArticles, handleLegalBank } from '../worker/src/legal-bank.js';
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
  assert.match(captured.sql, /l.document_number IN/);
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


test('نمایش متن کامل ماده فقط برای مدیر و با شناسه ماده در محدوده همان سند مجاز است', async () => {
  const fullBody = 'متن کامل و محرمانه‌نبوده ماده برای بررسی مدیر';
  const calls = [];
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        calls.push({ sql, bindings });
        return {
          first: async () => {
            if (sql.includes('FROM sessions')) return { id: 9, email: 'admin@example.test', display_name: 'مدیر' };
            if (sql.includes('SELECT membership_status FROM users')) return { membership_status: 'approved' };
            if (sql.includes('SELECT membership_no, professional_title, position')) return {};
            if (sql.includes('SELECT id,law_id AS lawId,article_number AS number')) return {
              id: 7, lawId: 2, number: '۵۶', heading: 'نقل و انتقال مال توقیف‌شده', body: fullBody, status: 'needs_review',
            };
            return null;
          },
          all: async () => sql.includes('SELECT role FROM user_roles') ? { results: [{ role: 'admin' }] } : { results: [] },
        };
      } };
    },
  };
  const request = new Request('https://mokhtari.ir/api/admin/legal-bank/articles?lawId=2&articleId=7', {
    headers: { cookie: 'wefagh_session=valid-session-token' },
  });
  const response = await handleLegalBank(request, { DB: db }, '/api/admin/legal-bank/articles');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.item.body, fullBody);
  assert.ok(calls.some((call) => call.sql.includes('WHERE law_id=?1 AND id=?2') && call.bindings[0] === 2 && call.bindings[1] === 7));

  const anonymous = await handleLegalBank(
    new Request('https://mokhtari.ir/api/admin/legal-bank/articles?lawId=2&articleId=7'),
    { DB: db },
    '/api/admin/legal-bank/articles',
  );
  assert.equal(anonymous.status, 401);
});


test('بازیابی مواد قانونی، آرای قضایی را به‌اشتباه به‌عنوان متن قانون وارد نمی‌کند', async () => {
  let captured;
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        return { all: async () => { captured = { sql, bindings }; return { results: [] }; } };
      } };
    },
  };
  await findVerifiedLegalArticles(db, 'ماده ۵۶ قانون اجرای احکام مدنی رأی وحدت رویه نظریه مشورتی');
  assert.match(captured.sql, /l\.law_type IN/);
  assert.ok(captured.bindings.includes('law'));
  assert.ok(captured.bindings.includes('regulation'));
  assert.ok(!captured.bindings.includes('judicial_advisory_opinion'));
  assert.ok(!captured.bindings.includes('supreme_court_unified_precedent'));
});

test('ورود نظریه مشورتی، شماره و تاریخ و مرجع و موضوع و پیوند رسمی را در بانک ثبت می‌کند', async () => {
  let inserted = null;
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        if (sql.includes('FROM sessions')) return { first: async () => ({ id: 9, email: 'admin@example.test', display_name: 'مدیر' }) };
        if (sql.includes('SELECT membership_status FROM users')) return { first: async () => ({ membership_status: 'approved' }) };
        if (sql.includes('SELECT membership_no, professional_title, position')) return { first: async () => ({}) };
        if (sql.includes('SELECT role FROM user_roles')) return { all: async () => ({ results: [{ role: 'admin' }] }) };
        if (sql.includes('INSERT INTO legal_laws')) return { first: async () => { inserted = { sql, bindings }; return { id: 44 }; } };
        if (sql.includes('INSERT INTO legal_articles')) return { run: async () => ({ success: true }) };
        return { first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) };
      } };
    },
    batch: async () => ({ success: true }),
  };
  const payload = {
    slug: 'advisory-opinion-7-1403-32',
    title: 'نظریه مشورتی اداره کل حقوقی قوه قضاییه',
    lawType: 'judicial_advisory_opinion',
    documentNumber: '۷/۱۴۰۳/۳۲',
    documentDate: '۱۴۰۳/۰۳/۰۶',
    issuingAuthority: 'اداره کل حقوقی قوه قضاییه',
    subject: 'موضوع دقیق نظریه',
    sourceName: 'پایگاه رسمی اداره کل حقوقی قوه قضاییه',
    officialSourceUrl: 'https://edarehoquqy.eadl.ir/opinion/32',
    discoverySourceUrl: 'https://eadil.com/',
    articles: [{ number: 'متن کامل', heading: 'متن نظریه', body: 'متن کامل نظریه مشورتی برای ورود و بررسی مدیر' }],
  };
  const request = new Request('https://mokhtari.ir/api/admin/legal-bank/import', {
    method: 'POST',
    headers: { cookie: 'wefagh_session=valid-session-token', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const response = await handleLegalBank(request, { DB: db }, '/api/admin/legal-bank/import');
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.status, 'needs_review');
  assert.ok(inserted.sql.includes('document_number,document_date,subject,official_source_url,discovery_source_url,content_sha256'));
  assert.ok(inserted.bindings.includes('۷/۱۴۰۳/۳۲'));
  assert.ok(inserted.bindings.includes('۱۴۰۳/۰۳/۰۶'));
  assert.ok(inserted.bindings.includes('موضوع دقیق نظریه'));
  assert.ok(inserted.bindings.includes('https://edarehoquqy.eadl.ir/opinion/32'));
});

test('ورود سند قضایی بدون فراداده هویتی یا پیوند رسمی رد می‌شود', async () => {
  const db = {
    prepare(sql) {
      return { bind() {
        if (sql.includes('FROM sessions')) return { first: async () => ({ id: 9, email: 'admin@example.test', display_name: 'مدیر' }) };
        if (sql.includes('SELECT membership_status FROM users')) return { first: async () => ({ membership_status: 'approved' }) };
        if (sql.includes('SELECT membership_no, professional_title, position')) return { first: async () => ({}) };
        if (sql.includes('SELECT role FROM user_roles')) return { all: async () => ({ results: [{ role: 'admin' }] }) };
        return { first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) };
      } };
    },
  };
  const request = new Request('https://mokhtari.ir/api/admin/legal-bank/import', {
    method: 'POST',
    headers: { cookie: 'wefagh_session=valid-session-token', 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: 'advisory-opinion-missing-source',
      title: 'نظریه مشورتی',
      lawType: 'judicial_advisory_opinion',
      articles: [{ number: 'متن کامل', body: 'متن کامل نظریه برای بررسی' }],
    }),
  });
  const response = await handleLegalBank(request, { DB: db }, '/api/admin/legal-bank/import');
  const data = await response.json();
  assert.equal(response.status, 422);
  assert.equal(data.error, 'JUDICIAL_METADATA_REQUIRED');
});


test('شماره رأی دقیق است و با شماره طولانی‌تر اشتباه گرفته نمی‌شود؛ تاریخ و مرجع نیز کنترل می‌شوند', async () => {
  const exact = {
    lawType: 'supreme_court_unified_precedent',
    documentNumber: '۸۵۸',
    documentDate: '۱۴۰۳/۰۸/۱۵',
    issuingAuthority: 'هیأت عمومی دیوان عالی کشور',
    lawTitle: 'رأی وحدت رویه شماره ۸۵۸',
  };
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        return { all: async () => {
          assert.match(sql, /l\.document_number IN/);
          assert.match(sql, /l\.document_date IN/);
          assert.match(sql, /l\.issuing_authority LIKE/);
          assert.match(sql, /l\.status='verified' AND a\.status='verified'/);
          assert.ok(bindings.includes('858'));
          return { results: [
            exact,
            { ...exact, documentNumber: '۸۵۸۱' },
            { ...exact, documentDate: '۱۴۰۳/۰۸/۱۶' },
            { ...exact, issuingAuthority: 'هیأت عمومی دیوان عدالت اداری' },
          ] };
        } };
      } };
    },
  };
  const found = await findVerifiedJudicialAuthorities(
    db,
    'رأی وحدت رویه شماره ۸۵۸ مورخ ۱۴۰۳/۰۸/۱۵ هیأت عمومی دیوان عالی کشور',
  );
  assert.deepEqual(found, [exact]);
});

test('شماره نظریه مشورتی فقط از نوع نظریه مشورتی بازیابی می‌شود', async () => {
  let captured;
  const advisory = { lawType: 'judicial_advisory_opinion', documentNumber: '7/1403/32', documentDate: '1403/03/06' };
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        captured = { sql, bindings };
        return { all: async () => ({ results: [
          advisory,
          { ...advisory, lawType: 'supreme_court_unified_precedent' },
        ] }) };
      } };
    },
  };
  const found = await findVerifiedJudicialAuthorities(db, 'نظریه مشورتی شماره ۷/۱۴۰۳/۳۲');
  assert.ok(captured.bindings.includes('judicial_advisory_opinion'));
  assert.ok(!captured.bindings.includes('supreme_court_unified_precedent'));
  assert.deepEqual(found, [advisory]);
});

test('در جست‌وجوی موضوعی بدون شماره، بازیابی متنی اسناد تأییدشده حفظ می‌شود', async () => {
  let captured;
  const db = {
    prepare(sql) {
      return { bind(...bindings) {
        captured = { sql, bindings };
        return { all: async () => ({ results: [{ lawTitle: 'رأی مرتبط', body: 'متن رأی' }] }) };
      } };
    },
  };
  const found = await findVerifiedJudicialAuthorities(db, 'رأی وحدت رویه درباره توقیف مال');
  assert.match(captured.sql, /a\.body LIKE/);
  assert.doesNotMatch(captured.sql, /l\.document_number IN/);
  assert.equal(found.length, 1);
});
