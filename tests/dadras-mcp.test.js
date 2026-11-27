import test from 'node:test';
import assert from 'node:assert/strict';
import { isDadrasSourceUrl, parseDadrasSearchResults, searchDadrasLegal } from '../worker/src/ai/dadras-mcp.js';

test('Dadras source links are restricted to HTTPS law pages on its own domain', () => {
  assert.equal(isDadrasSourceUrl('https://dadrasai.com/laws/law-1'), true);
  assert.equal(isDadrasSourceUrl('http://dadrasai.com/laws/law-1'), false);
  assert.equal(isDadrasSourceUrl('https://evil.example/laws/law-1'), false);
  assert.equal(isDadrasSourceUrl('https://dadrasai.com/assistant'), false);
});

test('Dadras search results are parsed as secondary sources with direct links', () => {
  const raw = `نتیجه جست‌وجو

1. ماده ۱۰ قانون مدنی
ماده ۱۰ قانون مدنی: قراردادهای خصوصی نسبت به کسانی که آن را منعقد نموده‌اند، نافذ است.
متن کامل: https://dadrasai.com/laws/madeh-10

2. ماده ۷ قانون حمایت از حقوق مصرف کنندگان خودرو
ماده ۷ قانون حمایت از حقوق مصرف کنندگان خودرو: توافق مخالف قانون باطل است.
متن کامل: https://dadrasai.com/laws/madeh-7
`;
  const results = parseDadrasSearchResults(raw, 5);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'ماده ۱۰ قانون مدنی');
  assert.equal(results[0].domain, 'dadrasai.com');
  assert.equal(results[0].status, 'منبع ثانویه؛ برای تطبیق با متن رسمی');
  assert.match(results[0].excerpt, /قراردادهای خصوصی/);
});

test('Dadras parser ignores non-Dadras and malformed links', () => {
  const raw = `1. ماده ۱۰ قانون مدنی
متن ماده
متن کامل: https://evil.example/laws/madeh-10

2. ماده ۱ قانون نمونه
متن ماده
متن کامل: http://dadrasai.com/laws/madeh-1
`;
  assert.deepEqual(parseDadrasSearchResults(raw), []);
});


test('Dadras receives only whitelisted legal terms, never names or case narrative', async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{
          type: 'text',
          text: '1. ماده ۱۰ قانون مدنی\nماده ۱۰ قانون مدنی: متن نمونه\nمتن کامل: https://dadrasai.com/laws/madeh-10',
        }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await searchDadrasLegal('شهرام مختاری در پرونده آقای الف، درباره ماده ۱۰ قانون مدنی و قرارداد خصوصی سؤال دارد');
    assert.equal(result.status, 'searched');
    assert.match(sent.params.arguments.query, /قانون مدنی/);
    assert.doesNotMatch(sent.params.arguments.query, /شهرام|مختاری|آقای الف|پرونده/);
    assert.equal(sent.params.arguments.limit, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
