// API وِفاق روی Cloudflare Worker. بدون وابستگی خارجی.
import { validateContact } from './validate.js';
import { saveContactMessage } from './contact.js';

const MAX_BODY_BYTES = 16 * 1024;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

async function readJsonBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    return { error: json({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, 415) };
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: json({ ok: false, error: 'INVALID_JSON' }, 400) };
  }
}

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

    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  },
};
