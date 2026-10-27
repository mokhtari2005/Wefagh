// مسیرهای احراز هویت: ثبت‌نام، تأیید ایمیل، ورود، خروج و /api/me.
// اصول: پاسخ‌ها طوری‌اند که وجود یا عدم وجود یک ایمیل را فاش نکنند؛ رمزها هرگز ذخیره یا لاگ نمی‌شوند.
import { json, readJsonBody, readCookie, sessionCookie, SESSION_COOKIE } from '../http.js';
import { cleanText, normalizeEmail } from '../validate.js';
import { hashPassword, verifyPassword, validatePasswordPolicy } from './password.js';
import { generateToken, hashToken, addMs, SESSION_TTL_MS, EMAIL_TOKEN_TTL_MS } from './token.js';
import { sendMail } from '../email/gmail.js';

export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 15;
const GENERIC_REGISTER_MSG = 'اگر این نشانی معتبر باشد، ایمیل تأیید برای شما ارسال شد.';

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
  return env.PUBLIC_BASE_URL || 'https://wefagh.ir';
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
  if (Object.keys(errors).length > 0) return json({ ok: false, error: 'VALIDATION_FAILED', errors }, 422);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (existing) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);

  const passwordHash = await hashPassword(body.password);
  let userId;
  try {
    const row = await env.DB
      .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?1, ?2, ?3) RETURNING id')
      .bind(email, passwordHash, displayName)
      .first();
    userId = row?.id;
  } catch (err) {
    // ثبت همزمان دو درخواست با یک ایمیل: پاسخ عمومی؛ سایر خطاها به کاربر نشان داده نمی‌شوند.
    if (String(err?.message || '').includes('UNIQUE')) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }

  // ادمین اصلی با ثبت‌نام همان ایمیل، نقش مدیر سامانه می‌گیرد (ایمیل خارج از مخزن تنظیم می‌شود).
  if (env.ADMIN_EMAIL && normalizeEmail(env.ADMIN_EMAIL) === email) {
    await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?1, 'super_admin')").bind(userId).run();
  }

  const token = generateToken();
  const now = new Date();
  await env.DB
    .prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await hashToken(token), userId, 'verify_email', addMs(now, EMAIL_TOKEN_TTL_MS))
    .run();

  const link = `${publicBaseUrl(env)}/#/verify?token=${token}`;
  try {
    await mailer(env)({
      to: email,
      subject: 'تأیید حساب وِفاق',
      text: `برای تأیید حساب خود روی لینک زیر کلیک کنید (تا ۳۰ دقیقه معتبر است):\n${link}\n\nاگر شما درخواست نکرده‌اید، این پیام را نادیده بگیرید.`,
    });
  } catch {
    // ارسال ایمیل ناموفق؛ کاربر در پاسخ عمومی متوجه جزئیات نمی‌شود. ارسال مجدد در مرحلهٔ بعد اضافه می‌شود.
  }
  return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
}

export async function verifyEmail(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const token = typeof parsed.body?.token === 'string' ? parsed.body.token : '';
  if (!token) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);

  const th = await hashToken(token);
  const row = await env.DB
    .prepare('SELECT user_id, purpose, expires_at, used_at FROM email_tokens WHERE token_hash = ?1')
    .bind(th)
    .first();
  const nowIso = new Date().toISOString();
  if (!row || row.purpose !== 'verify_email' || row.used_at || row.expires_at <= nowIso) {
    return json({ ok: false, error: 'INVALID_TOKEN' }, 400);
  }
  await env.DB.prepare('UPDATE users SET email_verified_at = ?1 WHERE id = ?2').bind(nowIso, row.user_id).run();
  await env.DB.prepare('UPDATE email_tokens SET used_at = ?1 WHERE token_hash = ?2').bind(nowIso, th).run();
  return json({ ok: true });
}

export async function login(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body && typeof parsed.body === 'object' ? parsed.body : {};
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const nowIso = new Date().toISOString();

  if (!email || !password) return json({ ok: false, error: 'INVALID_CREDENTIALS' }, 401);

  const user = await env.DB
    .prepare('SELECT id, password_hash, status, email_verified_at, failed_logins, locked_until FROM users WHERE email = ?1')
    .bind(email)
    .first();

  if (user?.locked_until && user.locked_until > nowIso) {
    return json({ ok: false, error: 'ACCOUNT_LOCKED' }, 423);
  }

  const passOk = await verifyPassword(password, user ? user.password_hash : await dummyHash());
  if (!user || !passOk || user.status !== 'active') {
    if (user) {
      const failed = (user.failed_logins || 0) + 1;
      const lockedUntil = failed >= LOCK_THRESHOLD ? addMs(new Date(), LOCK_MINUTES * 60 * 1000) : null;
      await env.DB
        .prepare('UPDATE users SET failed_logins = ?1, locked_until = ?2 WHERE id = ?3')
        .bind(failed, lockedUntil, user.id)
        .run();
    }
    return json({ ok: false, error: 'INVALID_CREDENTIALS' }, 401);
  }

  if (!user.email_verified_at) return json({ ok: false, error: 'EMAIL_NOT_VERIFIED' }, 403);

  await env.DB
    .prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?1')
    .bind(user.id)
    .run();

  const token = generateToken();
  await env.DB
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)')
    .bind(await hashToken(token), user.id, addMs(new Date(), SESSION_TTL_MS))
    .run();

  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)) });
}

export async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await hashToken(token)).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

/** @returns {Promise<{id:number,email:string,displayName:string,roles:string[]}|null>} */
export async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const nowIso = new Date().toISOString();
  const row = await env.DB
    .prepare(
      `SELECT u.id, u.email, u.display_name FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND u.status = 'active' AND u.email_verified_at IS NOT NULL`
    )
    .bind(await hashToken(token), nowIso)
    .first();
  if (!row) return null;
  const roleRows = await env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ?1').bind(row.id).all();
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roles: (roleRows?.results || []).map((r) => r.role),
  };
}

export async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
  return json({ ok: true, user });
}
