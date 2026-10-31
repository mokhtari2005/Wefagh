// مسیرهای احراز هویت: ثبت‌نام، تأیید ایمیل، ورود، خروج و /api/me.
// اصول: پاسخ‌ها طوری‌اند که وجود یا عدم وجود یک ایمیل را فاش نکنند؛ رمزها هرگز ذخیره یا لاگ نمی‌شوند.
import { json, readJsonBody, readCookie, sessionCookie, SESSION_COOKIE } from '../http.js';
import { cleanText, normalizeEmail } from '../validate.js';
import { hashPassword, verifyPassword, validatePasswordPolicy } from './password.js';
import { generateToken, hashToken, addMs, SESSION_TTL_MS, EMAIL_TOKEN_TTL_MS } from './token.js';
import { sendMail } from '../email/gmail.js';
import { validateProfile } from './profile.js';

/** گزارش فنی بدون داده‌های کاربر: فقط نام خطا و محل آن (هرگز ایمیل، رمز یا پروفایل). */
export function logError(where, err) {
  const entry = { where, error: err?.name || 'Error', detail: String(err?.message || '').slice(0, 200) };
  if (Number.isInteger(err?.status)) entry.status = err.status;
  if (typeof err?.reason === 'string' && /^[A-Za-z_]{1,40}$/.test(err.reason)) entry.reason = err.reason;
  if (Array.isArray(err?.missing)) {
    entry.missing = err.missing.filter((n) => typeof n === 'string' && /^GMAIL_[A-Z_]{1,40}$/.test(n));
  }
  console.error(JSON.stringify(entry));
}

/** رویداد عملیاتی بدون ایمیل یا توکن؛ فقط دلیل بازگشت ارسال مجدد. */
function logOutcome(where, outcome) {
  console.info(JSON.stringify({ where, outcome }));
}

export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 15;
const GENERIC_REGISTER_MSG = 'اگر این نشانی معتبر باشد، ایمیل تأیید برای شما ارسال شد.';
const RESEND_MSG = 'اگر این حساب در انتظار تأیید باشد، ایمیل تأیید دوباره ارسال شد.';
const RESEND_COOLDOWN_MS = 60 * 1000;

// هش ساختگی برای یکسان‌سازی زمان پاسخ وقتی کاربر وجود ندارد.
let dummyHashPromise;
function dummyHash() {
  dummyHashPromise ??= hashPassword('dummy-timing-pad-0');
  return dummyHashPromise;
}

function mailer(env) {
  // در تست‌ها env.mailer جایگزین می‌شود؛ در حالت واقعی از Gmail استفاده می‌شود.
  return env.mailer ?? ((args) => sendMail({ env, ...args }));
}

function publicBaseUrl(env) {
  return env.BASE_URL || 'https://mokhtari.ir';
}

export async function register(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body && typeof parsed.body === 'object' ? parsed.body : {};

  const email = normalizeEmail(body.email);
  const displayName = cleanText(body.displayName);
  const errors = {};
  if (!email) errors.email = 'نشانی ایمیل معتبر نیست.';
  const pol = validatePasswordPolicy(body.password);
  if (!pol.ok) errors.password = pol.error;
  if (displayName.length < 2 || displayName.length > 100) errors.displayName = 'نام نمایشی باید بین ۲ و ۱۰۰ نویسه باشد.';
  const profileCheck = validateProfile(body.profile);
  if (!profileCheck.ok) Object.assign(errors, profileCheck.errors);
  if (Object.keys(errors).length > 0) return json({ ok: false, error: 'VALIDATION_FAILED', errors }, 422);
  const profile = profileCheck.value;

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (existing) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
  // شماره تکراری: پاسخ عمومی همان ایمیل تکراری؛ شماره‌های ثبت‌شده فاش نمی‌شوند.
  let phoneTaken;
  try {
    phoneTaken = await env.DB
