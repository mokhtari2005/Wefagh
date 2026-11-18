import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDiagnostics } from '../worker/src/diagnostics.js';

function fakeDb() {
  const calls = [];
  return { calls, prepare(sql) { return { bind(...args) { return { run: async () => { calls.push({ sql, args }); return { success: true }; }, all: async () => ({ results: [] }) }; } }; } };
}

test('گزارش خطای مرورگر فقط داده‌های محدود و پالایش‌شده را ذخیره می‌کند', async () => {
  const db = fakeDb();
  const request = new Request('https://mokhtari.ir/api/diagnostics/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'api', component: 'regional-map', route: '/api/map/tiles/12/1/2.png?secret=1', errorCode: 'HTTP_503', httpStatus: 503, message: 'نباید ذخیره شود' }) });
  const response = await handleDiagnostics(request, { DB: db }, '/api/diagnostics/report');
  assert.equal(response.status, 202);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].args[3], '/api/map/tiles/12/1/2.png');
  assert.equal(db.calls[0].args[4], 'HTTP_503');
  assert.equal(JSON.stringify(db.calls).includes('نباید ذخیره شود'), false);
});

test('دسته‌بندی ناشناخته پذیرفته نمی‌شود', async () => {
  const request = new Request('https://mokhtari.ir/api/diagnostics/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'other' }) });
  const response = await handleDiagnostics(request, { DB: fakeDb() }, '/api/diagnostics/report');
  assert.equal(response.status, 422);
});
