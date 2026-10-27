// هش و بررسی رمز عبور با PBKDF2-SHA256 (Web Crypto). بدون وابستگی؛ در Worker و Node یکسان است.

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
// Workers حداکثر ۱۰۰٬۰۰۰ تکرار را برای PBKDF2 می‌پذیرد.
export const PBKDF2_ITERATIONS = 100000;

const enc = new TextEncoder();

function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return new Uint8Array(bits);
}

// مقایسهٔ زمان‌ثابت برای جلوگیری از حملات زمان‌سنجی.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validatePasswordPolicy(password) {
  if (typeof password !== 'string') return { ok: false, error: 'رمز عبور وارد نشده است.' };
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { ok: false, error: `رمز عبور باید بین ${PASSWORD_MIN} و ${PASSWORD_MAX} نویسه باشد.` };
  }
  return { ok: true };
}

/**
 * قالب خروجی: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
 */
export async function hashPassword(password, { iterations = PBKDF2_ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  let salt, expected;
  try {
    salt = fromB64(parts[2]);
    expected = fromB64(parts[3]);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
