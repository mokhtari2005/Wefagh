// توکن‌های تصادفی برای نشست و ایمیل. فقط هش SHA-256 توکن در دیتابیس ذخیره می‌شود.

const enc = new TextEncoder();

function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateToken(byteLength = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// مدت‌ها (میلی‌ثانیه)
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ۳۰ روز
export const EMAIL_TOKEN_TTL_MS = 30 * 60 * 1000; // ۳۰ دقیقه

export function addMs(date, ms) {
  return new Date(date.getTime() + ms).toISOString();
}
