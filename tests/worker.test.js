import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

// D1 ساختگی: ثبت فراخوانی‌ها و پاسخ قابل تنظیم.
function fakeDb({ fail = false, id = 42 } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            run: async () => {
              if (fail) throw new Error('boom');
              return { success: true, results: [{ id }] };
            },
          };
        },
      };
    },
  };
}

const URL_BASE = 'https://wefagh.ir';

function post(path, body, headers = {}) {
  return new Request(URL_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  name: 'مریم احمدی',
  email: 'maryam@example.com',
  topic: 'academy',
  message: 'لطفاً درباره دوره‌های آموزشی توضیح دهید.',
};

test('GET /api/health پاسخ سلامت می‌دهد', async () => {
  const res = await worker.fetch(new Request(URL_BASE + '/api/health'), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'wefagh-api' });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('POST /api/health متد مجاز نیست', async () => {
  const res = await worker.fetch(new Request(URL_BASE + '/api/health', { method: 'POST' }), {});
  assert.equal(res.status, 405);
});

test('مسیر ناشناخته ۴۰۴ می‌دهد', async () => {
  const res = await worker.fetch(new Request(URL_BASE + '/api/nope'), {});
  assert.equal(res.status, 404);
});

test('POST /api/contact با داده معتبر ۲۰۱ و شناسه برمی‌گرداند', async () => {
  const db = fakeDb({ id: 7 });
  const res = await worker.fetch(post('/api/contact', validBody), { DB: db });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, id: 7 });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].args, [validBody.name, validBody.email, validBody.topic, validBody.message]);
});

test('داده نامعتبر با ۴۲۲ و خطاهای فیلدی رد می‌شود و به DB نمی‌رسد', async () => {
  const db = fakeDb();
  const res = await worker.fetch(post('/api/contact', { ...validBody, email: 'bad' }), { DB: db });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, 'VALIDATION_FAILED');
  assert.ok(body.errors.email);
  assert.equal(db.calls.length, 0);
});

test('content-type غیر JSON با ۴۱۵ رد می‌شود', async () => {
  const req = new Request(URL_BASE + '/api/contact', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
  const res = await worker.fetch(req, { DB: fakeDb() });
  assert.equal(res.status, 415);
});

test('JSON خراب با ۴۰۰ رد می‌شود', async () => {
  const res = await worker.fetch(post('/api/contact', '{bad json'), { DB: fakeDb() });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'INVALID_JSON');
});

test('بدنهٔ بزرگ‌تر از ۱۶ کیلوبایت با ۴۱۳ رد می‌شود', async () => {
  const huge = JSON.stringify({ ...validBody, message: 'ا'.repeat(20000) });
  const res = await worker.fetch(post('/api/contact', huge), { DB: fakeDb() });
  assert.equal(res.status, 413);
});

test('GET /api/contact متد مجاز نیست', async () => {
  const res = await worker.fetch(new Request(URL_BASE + '/api/contact'), { DB: fakeDb() });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});

test('نبودن binding دیتابیس ۵۰۳ می‌دهد', async () => {
  const res = await worker.fetch(post('/api/contact', validBody), {});
  assert.equal(res.status, 503);
});

test('خطای دیتابیس ۵۰۰ می‌دهد بدون افشای جزئیات', async () => {
  const res = await worker.fetch(post('/api/contact', validBody), { DB: fakeDb({ fail: true }) });
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes('boom'));
  assert.equal(JSON.parse(text).error, 'INTERNAL_ERROR');
});
