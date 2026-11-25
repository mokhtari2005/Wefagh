import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupStaleVisitors, handleVisitorAnalytics } from '../worker/src/visitor-analytics.js';

function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, args: [] };
      calls.push(call);
      return {
        bind(...args) { call.args = args; return this; },
        run: async () => ({ success: true }),
        first: async () => null,
        all: async () => ({ results: [] }),
      };
    },
  };
}

test('heartbeat فقط حضور را ثبت می‌کند و پاک‌سازی جدول را اجرا نمی‌کند', async () => {
  const DB = fakeDb();
  const request = new Request('https://mokhtari.ir/api/analytics/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: '12345678-1234-1234-1234-123456789abc', path: '/assistant' }),
  });
  const response = await handleVisitorAnalytics(request, { DB }, '/api/analytics/heartbeat');
  assert.equal(response.status, 200);
  assert.equal(DB.calls.length, 1);
  assert.match(DB.calls[0].sql, /INSERT INTO site_visitors/);
  assert.doesNotMatch(DB.calls[0].sql, /DELETE FROM site_visitors/);
});

test('پاک‌سازی بازدیدکنندگان منقضی فقط در تابع دوره‌ای و با مقایسه ایندکس‌پذیر انجام می‌شود', async () => {
  const DB = fakeDb();
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  await cleanupStaleVisitors({ DB }, now);
  assert.equal(DB.calls.length, 1);
  assert.match(DB.calls[0].sql, /DELETE FROM site_visitors WHERE last_seen < \?1/);
  assert.equal(DB.calls[0].args[0], '2026-10-26T12:00:00.000Z');
  assert.doesNotMatch(DB.calls[0].sql, /datetime\(/i);
});

test('heartbeat بدون نشست کاربری، برای ثبت بازدید به احراز هویت وابسته نیست', async () => {
  const DB = fakeDb();
  const request = new Request('https://mokhtari.ir/api/analytics/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: '12345678-1234-1234-1234-123456789abc', path: '/' }),
  });
  const response = await handleVisitorAnalytics(request, { DB }, '/api/analytics/heartbeat');
  assert.equal(response.status, 200);
  assert.equal(DB.calls.length, 1);
  assert.equal(DB.calls[0].args[1], null);
  assert.equal(DB.calls[0].args[2], null);
});
