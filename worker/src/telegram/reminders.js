// یادآوری مواعد در تلگرام (Cron). هر موعد برای هر نوع یادآوری (۳ روز، ۱ روز، روز موعد) یک بار ارسال می‌شود.
// فقط از ساعت ۸ صبح به وقت تهران به بعد می‌فرستد تا شب پیام نیاید.
import { sendMessage, telegramConfigured } from './api.js';
import { tehranNow, shamsiLabel, toFa } from './dates.js';
import { addDays } from '../../../site/js/calc/core.js';

const KINDS = [
  { kind: 'd3', days: 3, head: 'یادآوری: سه روز تا موعد' },
  { kind: 'd1', days: 1, head: 'یادآوری: فردا موعد است' },
  { kind: 'd0', days: 0, head: 'یادآوری: امروز موعد است' },
];
const SEND_HOUR = 8;
const MAX_SENDS_PER_RUN = 40; // سقف درخواست‌های خروجی در هر اجرا؛ بقیه در اجرای بعدی می‌روند.
const KIND_LABEL = { hearing: 'جلسه', objection: 'اعتراض', appeal: 'تجدیدنظر', filing: 'تقدیم', other: 'سایر' };

export function reminderText(head, row) {
  const when = `${shamsiLabel(row.due_date)}${row.due_time ? ` ساعت ${toFa(row.due_time)}` : ''}`;
  return [
    `⏰ ${head}`,
    `${KIND_LABEL[row.kind] || 'سایر'}: ${row.title}`,
    row.case_no ? `پرونده: ${toFa(row.case_no)}` : null,
    `زمان: ${when}`,
    'مهلت‌ها را با منبع رسمی تطبیق دهید.',
  ].filter(Boolean).join('\n');
}

/** @returns {Promise<{sent:number}>} */
export async function sendDueReminders(env, now = new Date()) {
  if (!env?.DB || !telegramConfigured(env)) return { sent: 0 };
  const { date: today, hour } = tehranNow(now);
  if (hour < SEND_HOUR) return { sent: 0 };
  let sent = 0;
  for (const { kind, days, head } of KINDS) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    const target = addDays(today, days);
    const rows = await env.DB.prepare(
      `SELECT d.id, d.title, d.case_no, d.due_date, d.due_time, d.kind, l.chat_id
       FROM deadlines d JOIN telegram_links l ON l.user_id = d.user_id
       WHERE d.due_date = ?1 AND d.done = 0
         AND NOT EXISTS (SELECT 1 FROM telegram_reminders_sent r WHERE r.deadline_id = d.id AND r.kind = ?2)
       ORDER BY d.id ASC LIMIT ${MAX_SENDS_PER_RUN}`,
    ).bind(target, kind).all();
    for (const row of rows?.results || []) {
      if (sent >= MAX_SENDS_PER_RUN) break;
      if (await sendMessage(env, row.chat_id, reminderText(head, row))) {
        await env.DB.prepare('INSERT OR IGNORE INTO telegram_reminders_sent (deadline_id, kind) VALUES (?1, ?2)').bind(row.id, kind).run();
        sent += 1;
      }
    }
  }
  return { sent };
}
