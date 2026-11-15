// مسیرهای HTTP تلگرام: webhook (فقط با هدر محرمانه) و مدیریت اتصال حساب (فقط کاربر واردشده).
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { telegramConfigured, safeEqual } from './api.js';
import { processUpdate } from './bot.js';
import { createLinkCode, linkStatus, unlinkUser } from './link.js';

export async function handleTelegram(request, env, path) {
  if (path === '/api/telegram/webhook') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!telegramConfigured(env) || !env.DB) return json({ ok: false, error: 'TELEGRAM_NOT_CONFIGURED' }, 503);
    const secret = request.headers.get('x-telegram-bot-api-secret-token');
    if (!safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET.trim())) return json({ ok: false, error: 'FORBIDDEN' }, 403);
    const parsed = await readJsonBody(request);
    if (parsed.error) return json({ ok: true }); // به تلگرام همیشه ۲۰۰ می‌دهیم تا تکرار نکند.
    await processUpdate(env, parsed.body);
    return json({ ok: true });
  }

  if (path === '/api/telegram/link-code' || path === '/api/telegram/status' || path === '/api/telegram/unlink') {
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const user = await currentUser(request, env);
    if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
    if (path === '/api/telegram/status') {
      if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
      return json({ ok: true, ...(await linkStatus(env, user.id)), botUsername: env.TELEGRAM_BOT_USERNAME || null });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (path === '/api/telegram/unlink') {
      await unlinkUser(env, user.id);
      return json({ ok: true });
    }
    const r = await createLinkCode(env, user.id);
    if (!r.ok) return json({ ok: false, error: r.error }, 429);
    return json({ ok: true, code: r.code, expiresAt: r.expiresAt });
  }

  return null;
}
