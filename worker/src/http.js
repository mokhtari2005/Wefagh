// ابزارهای مشترک HTTP برای Worker: پاسخ JSON، کوکی، و خواندن بدنهٔ JSON با محدودیت اندازه.

export const MAX_BODY_BYTES = 16 * 1024;

export const SECURITY_HEADERS = {
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

export async function readJsonBody(request) {
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

export const SESSION_COOKIE = 'wefagh_session';

export function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
