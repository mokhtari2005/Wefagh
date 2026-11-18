// اعلان‌های داخلی تقویم؛ مالکیت همهٔ داده‌ها با user_id کنترل می‌شود.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';
import { tehranNow } from './telegram/dates.js';
import { addDays } from '../../site/js/calc/core.js';

const REMINDERS = [
  { kind: 'd3', days: 3, title: 'یادآوری موعد؛ سه روز باقی مانده' },
  { kind: 'd1', days: 1, title: 'یادآوری موعد؛ فردا' },
  { kind: 'd0', days: 0, title: 'یادآوری موعد؛ امروز' },
];

export async function createDueNotifications(env, now = new Date()) {
  if (!env?.DB) return { created: 0 };
  const { date } = tehranNow(now);
  let created = 0;
  for (const reminder of REMINDERS) {
    const target = addDays(date, reminder.days);
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO user_notifications (user_id, deadline_id, kind, title, body)
       SELECT d.user_id, d.id, ?1, ?2,
         d.title || CASE WHEN d.due_time IS NOT NULL THEN '، ساعت ' || d.due_time ELSE '' END
       FROM deadlines d
       LEFT JOIN notification_preferences p ON p.user_id = d.user_id
       WHERE d.due_date = ?3 AND d.done = 0 AND COALESCE(p.in_app_enabled, 1) = 1`
    ).bind(reminder.kind, reminder.title, target).run();
    created += Number(result?.meta?.changes || 0);
  }
  return { created };
}

export async function handleNotifications(request, env, path) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  if (path === '/api/notifications') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT id, deadline_id AS deadlineId, kind, title, body, created_at AS createdAt, read_at AS readAt
         FROM user_notifications WHERE user_id = ?1 ORDER BY id DESC LIMIT 100`
      ).bind(user.id).all();
      const unread = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ?1 AND read_at IS NULL'
      ).bind(user.id).first();
      const prefs = await env.DB.prepare(
        'SELECT in_app_enabled AS inAppEnabled FROM notification_preferences WHERE user_id = ?1'
      ).bind(user.id).first();
      return json({ ok: true, notifications: rows?.results || [], unreadCount: unread?.count || 0, preferences: { inAppEnabled: prefs ? Boolean(prefs.inAppEnabled) : true } });
    }
    if (request.method === 'PATCH') {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const id = Number(parsed.body?.id);
      if (!Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
      await env.DB.prepare('UPDATE user_notifications SET read_at = ?1 WHERE id = ?2 AND user_id = ?3 AND read_at IS NULL')
        .bind(new Date().toISOString(), id, user.id).run();
      return json({ ok: true });
    }
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, PATCH' });
  }

  if (path === '/api/notifications/preferences') {
    if (request.method !== 'PUT') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'PUT' });
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    if (typeof parsed.body?.inAppEnabled !== 'boolean') return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    await env.DB.prepare(
      `INSERT INTO notification_preferences (user_id, in_app_enabled, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(user_id) DO UPDATE SET in_app_enabled = excluded.in_app_enabled, updated_at = excluded.updated_at`
    ).bind(user.id, parsed.body.inAppEnabled ? 1 : 0, new Date().toISOString()).run();
    return json({ ok: true });
  }
  return null;
}
