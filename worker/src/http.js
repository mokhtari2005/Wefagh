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
  if (!/^application\\/json(?:\\s*;|$)/i.test(type)) {
    return { error: json({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, 415) };
  }

  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  }

  // بدنه را به‌صورت جریانی می‌خوانیم تا درخواست بدون Content-Length نتواند
  // پیش از بررسی اندازه، حافظهٔ Worker را با یک متن بزرگ مصرف کند.
  const reader = request.body?.getReader();
  const chunks = [];
  let total = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel('JSON body too large').catch(() => {});
          return { error: json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
        }
        chunks.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: json({ ok: false, error: 'INVALID_JSON' }, 400) };
  }
}

/**
 * درخواست تغییردهندهٔ اطلاعات که با کوکی نشست احراز هویت شده، فقط از مبدأ
 * اصلی سایت پذیرفته می‌شود. نبود Origin در چنین درخواستی عمداً fail-closed است.
 */
export function isSameOriginMutationAllowed(request, env = {}) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;
  if (!readCookie(request, SESSION_COOKIE)) return true;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite.toLowerCase() === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const expected = new URL(env.PUBLIC_BASE_URL || env.BASE_URL || 'https://mokhtari.ir').origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
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
