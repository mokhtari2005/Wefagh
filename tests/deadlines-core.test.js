import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayIso, statusOf, sortDeadlines, upcomingOpen } from '../site/js/deadlines-core.js';

test('todayIso تاریخ تهران را برمی‌گرداند، نه UTC', () => {
  // ۲۰:۳۰ UTC یعنی ۲۴:۰۰ تهران (روز بعد) در زمان تهران +۳:۳۰
  const late = new Date('2026-10-27T21:00:00Z');
  assert.equal(todayIso(late), '2026-10-28');
  assert.equal(todayIso(new Date('2026-10-27T10:00:00Z')), '2026-10-27');
});

test('statusOf وضعیت را درست تشخیص می‌دهد', () => {
  const today = '2026-10-28';
  assert.equal(statusOf({ dueDate: '2026-10-01', done: false }, today), 'overdue');
  assert.equal(statusOf({ dueDate: '2026-10-01', done: true }, today), 'done');
  assert.equal(statusOf({ dueDate: '2026-10-28', done: false }, today), 'today');
  assert.equal(statusOf({ dueDate: '2026-11-01', done: false }, today), 'upcoming');
});

test('sortDeadlines بر اساس تاریخ و سپس شناسه، بدون تغییر ورودی', () => {
  const input = [
    { id: 3, dueDate: '2026-11-02' },
    { id: 2, dueDate: '2026-11-01' },
    { id: 1, dueDate: '2026-11-02' },
  ];
  const sorted = sortDeadlines(input);
  assert.deepEqual(sorted.map((x) => x.id), [2, 1, 3]);
  assert.equal(input[0].id, 3);
});

test('upcomingOpen فقط موارد انجام‌نشدهٔ از امروز به بعد را برمی‌گرداند', () => {
  const items = [
    { id: 1, dueDate: '2026-10-20', done: false },
    { id: 2, dueDate: '2026-10-28', done: false },
    { id: 3, dueDate: '2026-11-05', done: true },
    { id: 4, dueDate: '2026-11-01', done: false },
    { id: 5, dueDate: '2026-12-01', done: false },
  ];
  assert.deepEqual(upcomingOpen(items, '2026-10-28', 2).map((x) => x.id), [2, 4]);
});
