import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLegalBank } from '../worker/src/legal-bank.js';

function responseJson(response) {
  return response.json();
}

function dbFor({ docStatus = 'needs_review' } = {}) {
  const calls = [];
  const document = {
    id: 7, slug: 'sample-law', title: 'قانون نمونه', lawType: 'law',
    status: docStatus, officialSourceUrl: 'https://qavanin.ir/sample',
  };
  return {
    calls,
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            all: async () => {
              calls.push({ sql, bindings });
              if (sql.includes('legal_document_sources')) {
                return { results: [{ key: 'national-regulations', title: 'سامانه ملی قوانین و مقررات', lastSuccessAt: null }] };
              }
              if (sql.includes('GROUP BY law_type,status')) {
                return { results: [{ type: 'law', status: 'needs_review', count: 1 }] };
              }
              if (sql.includes('FROM legal_articles') && sql.includes('COUNT(*) AS total')) {
                return { results: [{ total: 4, verified: 0, needsReview: 4 }] };
              }
              if (sql.includes('FROM legal_laws') && sql.includes('GROUP BY l.id')) {
                return { results: [{ ...document, articleCount: 4 }] };
              }
              if (sql.includes('FROM legal_articles') && sql.includes('ORDER BY id LIMIT')) {
                return { results: [{ number: '1', heading: 'ماده ۱', body: 'متن تأییدشده' }] };
              }
              return { results: [] };
            },
            first: async () => {
              calls.push({ sql, bindings });
              return document;
            },
          };
        },
        all: async () => {
          calls.push({ sql, bindings: [] });
          if (sql.includes('GROUP BY law_type,status')) return { results: [{ type: 'law', status: 'needs_review', count: 1 }] };
          if (sql.includes('legal_document_sources')) return { results: [] };
          if (sql.includes('legal_laws')) return { results: [{ ...document, articleCount: 4 }] };
          if (sql.includes('legal_articles')) return { results: [{ total: 4, verified: 0, needsReview: 4 }] };
          return { results: [] };
        },
        first: async () => {
          calls.push({ sql, bindings: [] });
          return document;
        },
      };
    },
  };
}

test('public legal bank statistics are readable without authentication', async () => {
  const DB = dbFor();
  const response = await handleLegalBank(new Request('https://mokhtari.ir/api/legal-bank/public-stats'), { DB }, '/api/legal-bank/public-stats');
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.byType));
  assert.ok(Array.isArray(body.sources));
  assert.ok(Array.isArray(body.latest));
});

test('public statistics and search exclude malformed DOTIC research chunks', async () => {
  const DB = dbFor();
  const stats = await handleLegalBank(new Request('https://mokhtari.ir/api/legal-bank/public-stats'), { DB }, '/api/legal-bank/public-stats');
  assert.equal(stats.status, 200);
  const statsSql = DB.calls.map(call => call.sql).join('\n');
  assert.match(statsSql, /پیکره پژوهشی قوانین ایران/);
  assert.match(statsSql, /law_type='other'/);
  assert.match(statsSql, /JOIN legal_laws l ON l.id=a.law_id/);

  DB.calls.length = 0;
  const search = await handleLegalBank(
    new Request('https://mokhtari.ir/api/legal-bank/public-search?q=قانون'),
    { DB },
    '/api/legal-bank/public-search',
  );
  assert.equal(search.status, 200);
  assert.match(DB.calls[0].sql, /پیکره پژوهشی قوانین ایران/);
});

test('public document lookup also excludes malformed DOTIC records', async () => {
  const DB = dbFor();
  const response = await handleLegalBank(
    new Request('https://mokhtari.ir/api/legal-bank/public-document?id=7'),
    { DB },
    '/api/legal-bank/public-document',
  );
  assert.equal(response.status, 200);
  assert.match(DB.calls[0].sql, /پیکره پژوهشی قوانین ایران/);
});

test('public search is read-only and does not require a login', async () => {
  const DB = dbFor();
  const response = await handleLegalBank(
    new Request('https://mokhtari.ir/api/legal-bank/public-search?q=قانون'),
    { DB },
    '/api/legal-bank/public-search',
  );
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.items));
});

test('public document endpoint withholds unverified full text', async () => {
  const DB = dbFor({ docStatus: 'needs_review' });
  const response = await handleLegalBank(new Request('https://mokhtari.ir/api/legal-bank/public-document?id=7'), { DB }, '/api/legal-bank/public-document');
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.textAvailable, false);
  assert.deepEqual(body.articles, []);
  assert.equal(body.document.status, 'needs_review');
});

test('public document endpoint returns only verified article text', async () => {
  const DB = dbFor({ docStatus: 'verified' });
  const response = await handleLegalBank(new Request('https://mokhtari.ir/api/legal-bank/public-document?id=7'), { DB }, '/api/legal-bank/public-document');
  const body = await responseJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.textAvailable, true);
  assert.equal(body.articles[0].body, 'متن تأییدشده');
});

test('public endpoints reject non-GET methods', async () => {
  const DB = dbFor();
  const response = await handleLegalBank(new Request('https://mokhtari.ir/api/legal-bank/public-stats', { method: 'POST' }), { DB }, '/api/legal-bank/public-stats');
  assert.equal(response.status, 405);
});
