import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBackupExpired } from '../worker/src/backups.js';

test('نسخه پشتیبان دقیقاً پس از ۲۴ ساعت منقضی می‌شود', () => {
  const now = Date.parse('2026-11-21T12:00:00.000Z');
  assert.equal(isBackupExpired('2026-11-20T12:00:00.000Z', now), true);
  assert.equal(isBackupExpired('2026-11-20T12:00:00.001Z', now), false);
  assert.equal(isBackupExpired('2026-11-21T11:59:59.999Z', now), false);
});

test('زمان نامعتبر باعث حذف نسخه پشتیبان نمی‌شود', () => {
  assert.equal(isBackupExpired('', Date.now()), false);
  assert.equal(isBackupExpired('not-a-date', Date.now()), false);
});

test('نسخه‌های جدیدتر از مهلت ۲۴ ساعته حفظ می‌شوند', () => {
  const now = Date.parse('2026-11-21T18:00:00.000Z');
  for (const hoursAgo of [0, 1, 6, 12, 18, 23]) {
    const date = new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
    assert.equal(isBackupExpired(date, now), false);
  }
});
