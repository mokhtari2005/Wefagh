// API وِفاق روی Cloudflare Worker. بدون وابستگی خارجی.
import { validateContact } from './validate.js';
import { saveContactMessage } from './contact.js';
import { json, readJsonBody, isSameOriginMutationAllowed } from './http.js';
import { register, verifyEmail, resendVerification, login, logout, me } from './auth/routes.js';
import { changePassword, updateProfile, updateAvatar, deleteAvatar, getAvatar } from './auth/account.js';
import { handleAcademy } from './academy/routes.js';
import { handleMedia } from './media/routes.js';
import { handleDeadlines } from './deadlines/routes.js';
import { handleCases } from './cases/routes.js';
import { handleMootBank } from './moot/routes.js';
import { handleDashboard } from './dashboard.js';
import { handleAdminCases } from './admin-cases.js';
import { handleAdmin } from './admin.js';
import { handleAdminMedia } from './admin-media.js';
import { handleAdminMail } from './admin-mail.js';
import { handleAdminMembership } from './admin-membership.js';
import { handleAdminAi } from './admin-ai.js';
import { handleLegalBank } from './legal-bank.js';
import { handleAi } from './ai/routes.js';
import { handleAccess } from './access.js';
import { handleTelegram } from './telegram/routes.js';
import { sendDueReminders } from './telegram/reminders.js';
import { collectLegalNews } from './media/news.js';
import { handleNotifications, createDueNotifications } from './notifications.js';
import { handlePush } from './push/routes.js';
import { sendDuePushReminders } from './push/reminders.js';
import { handleMapTiles } from './map-tiles.js';
import { handleDiagnostics } from './diagnostics.js';
import { handleDiagnosticRepair } from './diagnostic-repair.js';
import { handleDiagnosticSelfTest } from './diagnostic-self-test.js';

// برای سازگاری با تست‌های قبلی، json را از اینجا هم صادر می‌کنیم.
export { json };

async function handleContact(request, env) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;

  const v = validateContact(parsed.body);
  if (!v.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: v.errors }, 422);

  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);

  try {
    const { id } = await saveContactMessage(env.DB, v.value);
    return json({ ok: true, id }, 201);
  } catch {
    // جزئیات خطا به کاربر نشان داده نمی‌شود.
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }
}

// جدول مسیرهای احراز هویت: مسیر → [متد مجاز، تابع]
const AUTH_ROUTES = {
  '/api/auth/register': ['POST', register],
  '/api/auth/verify-email': ['POST', verifyEmail],
  '/api/auth/resend-verification': ['POST', resendVerification],
  '/api/auth/login': ['POST', login],
  '/api/auth/logout': ['POST', logout],
  '/api/me': ['GET', me],
  '/api/me/profile': ['PUT', updateProfile],
  '/api/me/avatar': ['POST', updateAvatar],
  '/api/auth/change-password': ['POST', changePassword],
};

export default {
  async fetch(request, env) {
    if (!isSameOriginMutationAllowed(request, env)) {
      return json({ ok: false, error: 'CROSS_ORIGIN_REQUEST_BLOCKED' }, 403);
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path.startsWith('/api/map/tiles/')) return handleMapTiles(request);
    if (path === '/api/admin/diagnostics/self-test' || path === '/api/admin/diagnostics/write-test') return handleDiagnosticSelfTest(request, env, path);
    if (path.startsWith('/api/admin/diagnostics/repair')) return handleDiagnosticRepair(request, env, path);
    if (path === '/api/admin/diagnostics' || path.startsWith('/api/admin/diagnostics/') || path.startsWith('/api/diagnostics/')) return handleDiagnostics(request, env, path);

    if (path === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, HEAD' });
      }
      return json({ ok: true, service: 'wefagh-api' });
    }

    if (path === '/api/access-settings' || path === '/api/admin/settings/access') {
      const res = await handleAccess(request, env, path);
      if (res) return res;
    }

    if (path === '/api/contact') {
      return handleContact(request, env);
    }

    if (path === '/api/me/avatar' && request.method === 'GET') {\n      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);\n      try { return await getAvatar(request, env); }\n      catch (err) { console.error(JSON.stringify({ where: 'route:/api/me/avatar:get', error: err?.name || 'Error' })); return json({ ok: false, error: 'INTERNAL_ERROR' }, 500); }\n    }\n\n    if (path === '/api/me/avatar' && request.method === 'DELETE') {
      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
      try { return await deleteAvatar(request, env); }
      catch (err) { console.error(JSON.stringify({ where: 'route:/api/me/avatar', error: err?.name || 'Error' })); return json({ ok: false, error: 'INTERNAL_ERROR' }, 500); }
    }

    const route = AUTH_ROUTES[path];
    if (route) {
      const [method, handler] = route;
      if (request.method !== method) {
        return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: method });
      }
      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
      try {
        return await handler(request, env);
      } catch (err) {
        // هر خطای پیش‌بینی‌نشده: پاسخ JSON امن و گزارش فنی بدون داده‌های کاربر.
        console.error(JSON.stringify({ where: `route:${path}`, error: err?.name || 'Error' }));
        return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
      }
    }

    if (path === '/api/admin/cases/import' || path === '/api/admin/cases/status' || path === '/api/admin/courses/import-builtin') {
      const res = await handleAdminCases(request, env, path);
      if (res) return res;
    }

    if (path === '/api/admin/members' || path.startsWith('/api/admin/members/')) {
      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
      try {
        const res = await handleAdminMembership(request, env, path);
        if (res) return res;
      } catch (err) {
        console.error(JSON.stringify({ where: `route:${path}`, error: err?.name || 'Error' }));
        return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
      }
    }

    if (path.startsWith('/api/admin/mail/')) {
      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
      try {
        const res = await handleAdminMail(request, env, path);
        if (res) return res;
      } catch (err) {
        console.error(JSON.stringify({ where: `route:${path}`, error: err?.name || 'Error' }));
        return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
      }
    }

    if (path === '/api/admin/ai/status') {
      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
      try {
        const res = await handleAdminAi(request, env, path);
        if (res) return res;
      } catch (err) {
        console.error(JSON.stringify({ where: `route:${path}`, error: err?.name || 'Error' }));
        return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
      }
    }

    if (path.startsWith('/api/admin/legal-bank/') || path === '/api/legal-bank/search') {
      const res = await handleLegalBank(request, env, path);
      if (res) return res;
    }

    if (path === '/api/admin/content' || path.startsWith('/api/admin/content/')) {
      const res = await handleAdmin(request, env, path);
      if (res) return res;
    }

    if (path === '/api/admin/media' || path.startsWith('/api/admin/media/')) {
      const res = await handleAdminMedia(request, env, path);
      if (res) return res;
    }

    if (path.startsWith('/api/dashboard/')) {
      const res = await handleDashboard(request, env, path);
      if (res) return res;
    }

    if (path === '/api/deadlines' || path.startsWith('/api/deadlines/')) {
      const res = await handleDeadlines(request, env, path);
      if (res) return res;
    }

    if (path === '/api/moot/cases' || path.startsWith('/api/moot/cases/') || path === '/api/moot/history') {
      const res = await handleMootBank(request, env, path);
      if (res) return res;
    }

    if (path === '/api/cases' || path.startsWith('/api/cases/') || path === '/api/moot/sessions' || path.startsWith('/api/moot/sessions/')) {
      const res = await handleCases(request, env, path);
      if (res) return res;
    }

    if (path.startsWith('/api/media/')) {
      const res = await handleMedia(request, env, path);
      if (res) return res;
    }

    if (path === '/api/ai/status' || path.startsWith('/api/ai/')) {
      const res = await handleAi(request, env, path);
      if (res) return res;
    }

    if (path === '/api/push/public-key' || path === '/api/push/subscription') {
      try { const res = await handlePush(request, env, path); if (res) return res; }
      catch (err) { console.error(JSON.stringify({ where:'route:push', error:err?.name || 'Error' })); return json({ok:false,error:'INTERNAL_ERROR'},500); }
    }

    if (path === '/api/notifications' || path === '/api/notifications/preferences') {
      const res = await handleNotifications(request, env, path);
      if (res) return res;
    }

    if (path.startsWith('/api/telegram/')) {
      const res = await handleTelegram(request, env, path);
      if (res) return res;
    }

    if (path.startsWith('/api/academy/')) {
      const res = await handleAcademy(request, env, path);
      if (res) return res;
    }

    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  },

  // Cron: یادآوری مواعد در تلگرام (هر ۳۰ دقیقه؛ فقط از ساعت ۸ صبح تهران می‌فرستد).
  async scheduled(event, env, ctx) {
    if (event.cron === '*/5 * * * *') {
      ctx.waitUntil(sendDuePushReminders(env).catch((err) => console.error(JSON.stringify({ where: 'push.cron', error: err?.name || 'Error' }))));
    }
    if (event.cron === '30 1 * * *') {
      ctx.waitUntil(collectLegalNews(env).catch((err) => console.error(JSON.stringify({ where: 'media.news.cron', error: err?.name || 'Error' }))));
    }
    if (event.cron === '*/30 * * * *') {
      ctx.waitUntil(sendDueReminders(env).catch((err) => console.error(JSON.stringify({ where: 'telegram.cron', error: err?.name || 'Error' }))));
      ctx.waitUntil(createDueNotifications(env).catch((err) => console.error(JSON.stringify({ where: 'notifications.cron', error: err?.name || 'Error' }))));

    }
  },
};
