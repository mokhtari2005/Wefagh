import { sendMail } from './resend.js';

function tehranParts(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return {
    clock: parts.find((part) => part.type === 'hour').value + ':' + parts.find((part) => part.type === 'minute').value,
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now),
  };
}

export function buildDeadlineReminderEmail(row) {
  const dueDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'long', timeZone: 'Asia/Tehran',
  }).format(new Date(row.due_date + 'T12:00:00+03:30'));
  const subject = 'یادآوری موعد دادرسی | آکادمی وکالت شهرام مختاری';
  const text = [
    'عضو گرامی آکادمی وکالت شهرام مختاری،',
    '',
    'این پیام یادآوری موعدی است که در تقویم مواعد خود ثبت کرده‌اید.',
    '',
    'عنوان: ' + row.title,
    'تاریخ موعد: ' + dueDate,
    row.due_time ? 'ساعت: ' + row.due_time : null,
    row.case_no ? 'شماره پرونده: ' + row.case_no : null,
    '',
    'برای مشاهده یا ویرایش موعد وارد حساب خود شوید:',
    'https://mokhtari.ir/#/deadlines',
    '',
    'این پیام به‌صورت خودکار ارسال شده است.',
    'آکادمی وکالت شهرام مختاری',
  ].filter(Boolean).join('\\n');
  return { subject, text };
}

export async function sendDueEmailReminders(env, now = new Date()) {
  if (!env?.DB || !env.RESEND_API_KEY) return { sent: 0, skipped: 'MAIL_NOT_CONFIGURED' };
  const { date, clock } = tehranParts(now);
  const rows = await env.DB.prepare(`
    SELECT d.id, d.title, d.case_no, d.due_date, d.due_time, u.email
    FROM deadlines d
    JOIN users u ON u.id = d.user_id
    WHERE d.done = 0 AND d.reminder_enabled = 1
      AND d.due_date = date(?1, '+' || d.reminder_days || ' day')
      AND d.reminder_time <= ?2
      AND u.email IS NOT NULL AND u.email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM deadline_email_reminders_sent s WHERE s.deadline_id = d.id
      )
    ORDER BY d.id LIMIT 100
  `).bind(date, clock).all();

  let sent = 0;
  for (const row of rows.results || []) {
    try {
      const message = buildDeadlineReminderEmail(row);
      await sendMail({ env, to: row.email, ...message });
      await env.DB.prepare(
        'INSERT OR IGNORE INTO deadline_email_reminders_sent(deadline_id, sent_at) VALUES(?1, ?2)'
      ).bind(row.id, now.toISOString()).run();
      sent++;
    } catch (error) {
      console.error(JSON.stringify({ where: 'deadline.email.send', error: error?.name || 'Error' }));
    }
  }
  return { sent, considered: rows.results?.length || 0 };
}
