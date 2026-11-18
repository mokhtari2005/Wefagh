import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeadlineReminderEmail } from '../worker/src/email/deadline-reminders.js';

test('deadline reminder email contains the deadline details and calendar link', () => {
  const message = buildDeadlineReminderEmail({
    title: 'جلسه رسیدگی',
    case_no: '۱۴۰۵/۱۲۳',
    due_date: '2026-11-20',
    due_time: '09:30',
  });
  assert.match(message.subject, /یادآوری موعد دادرسی/);
  assert.match(message.text, /جلسه رسیدگی/);
  assert.match(message.text, /۱۴۰۵\/۱۲۳/);
  assert.match(message.text, /۰۹:۳۰|09:30/);
  assert.match(message.text, /https:\/\/mokhtari\.ir\/#\/deadlines/);
});

test('deadline reminder email omits optional fields when they are absent', () => {
  const message = buildDeadlineReminderEmail({
    title: 'ثبت لایحه',
    due_date: '2026-11-20',
    due_time: null,
    case_no: null,
  });
  assert.match(message.text, /ثبت لایحه/);
  assert.doesNotMatch(message.text, /شماره پرونده:/);
  assert.doesNotMatch(message.text, /ساعت:/);
});
