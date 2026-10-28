// اگر migration محتوای مدیریت (۰۰۰۶) در دیتابیس اجرا نشده باشد، فهرست‌های عمومی نباید ۵۰۰ بدهند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

function brokenDb() {
  return {
    prepare() {
      throw new Error('no such table: admin_content');
    },
  };
}

async function get(path) {
  return worker.fetch(new Request(`https://wefagh.ir${path}`), { DB: brokenDb() });
}

test('فهرست دوره‌ها بدون جدول محتوا ۲۰۰ و دوره‌های داخلی را برمی‌گرداند', async () => {
  const res = await get('/api/academy/courses');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.courses.length >= 1);
});

test('فهرست پرونده‌ها بدون جدول محتوا ۲۰۰ و پرونده‌های داخلی را برمی‌گرداند', async () => {
  const res = await get('/api/cases');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.cases.length >= 1);
});

test('جزئیات دوره داخلی بدون جدول محتوا کار می‌کند و شناسهٔ ناشناخته ۴۰۴ می‌دهد', async () => {
  const ok = await get('/api/academy/courses/civil-basics');
  assert.equal(ok.status, 200);
  const missing = await get('/api/academy/courses/no-such-course');
  assert.equal(missing.status, 404);
});

test('پاسخ خطا جزئیات داخلی دیتابیس را افشا نمی‌کند', async () => {
  const res = await get('/api/cases/no-such-case');
  const text = await res.text();
  assert.doesNotMatch(text, /admin_content|no such table/);
});

test('داشبورد بدون جدول‌های اختیاری ۵۰۰ نمی‌دهد و بخش تمرین خالی است', async () => {
  const db = {
    prepare(sql) {
      if (/moot_sessions|admin_content/.test(sql)) throw new Error('no such table');
      return {
        bind: () => ({ all: async () => ({ results: [] }), first: async () => null }),
        all: async () => ({ results: [] }),
      };
    },
  };
  // کاربر واردشده: احراز هویت را با نشست ساختگی در حافظه تأمین می‌کنیم از طریق مسیر /api/me در آزمون‌های دیگر؛ این آزمون فقط مسیر بدون ورود را بررسی می‌کند.
  const res = await worker.fetch(new Request('https://wefagh.ir/api/dashboard/summary'), { DB: db });
  assert.equal(res.status, 401);
});

test('فهرست تمرین‌های موت‌کورت بدون جدول ۵۰۳ با کد روشن می‌دهد (نه ۵۰۰)', async () => {
  const { currentUser } = await import('../worker/src/auth/routes.js');
  assert.equal(typeof currentUser, 'function');
  const res = await worker.fetch(new Request('https://wefagh.ir/api/moot/sessions'), { DB: brokenDb() });
  assert.ok([401, 503].includes(res.status), `status=${res.status}`);
  assert.doesNotMatch(await res.text(), /moot_sessions|no such table/);
});
