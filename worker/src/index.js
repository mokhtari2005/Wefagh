// API وِفاق روی Cloudflare Worker. بدون وابستگی خارجی.
import { validateContact } from './validate.js';
import { saveContactMessage } from './contact.js';
import { json, readJsonBody } from './http.js';
import { register, verifyEmail, login, logout, me } from './auth/routes.js';
import { handleAcademy } from './academy/routes.js';
import { handleMedia } from './media/routes.js';

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
  '/api/auth/login': ['POST', login],
  '/api/auth/logout': ['POST', logout],
  '/api/me': ['GET', me],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, HEAD' });
      }
      return json({ ok: true, service: 'wefagh-api' });
    }

    if (path === '/api/contact') {
      return handleContact(request, env);
    }

    const route = AUTH_ROUTES[path];
    if (route) {
      const [method, handler] = route;
      if (request.method !== method) {
        return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: method });
      }
      if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
      return handler(request, env);
    }

    if (path.startsWith('/api/media/')) {
      const res = await handleMedia(request, path);
      if (res) return res;
    }

    if (path.startsWith('/api/academy/')) {
      const res = await handleAcademy(request, env, path);
      if (res) return res;
    }

    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  },
};
