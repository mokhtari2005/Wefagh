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
  const profileCheck = validateProfile(body.profile);
  if (!profileCheck.ok) Object.assign(errors, profileCheck.errors);
  if (Object.keys(errors).length > 0) return json({ ok: false, error: 'VALIDATION_FAILED', errors }, 422);
  const profile = profileCheck.value;

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (existing) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
  // شماره تکراری: پاسخ عمومی همان ایمیل تکراری؛ شماره‌های ثبت‌شده فاش نمی‌شوند.
  let phoneTaken;
  try {
    phoneTaken = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE phone = ?1').bind(profile.phone).first();
  } catch (err) {
    // جدول پروفایل در این محیط وجود ندارد (مهاجرت ۰۰۰۸ اجرا نشده): ثبت‌نامی ساخته نمی‌شود.
    logError('register.phone_check', err);
    return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
  }
  if (phoneTaken) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);

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
    logError('register.insert_user', err);
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }

  try {
    await insertProfile(env, userId, profile);
  } catch (err) {
    // پروفایل ذخیره نشد: حساب ناقص نماند.
    await env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(userId).run();
    if (String(err?.message || '').includes('UNIQUE')) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
    logError('register.insert_profile', err);
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }

  // ادمین اصلی با ثبت‌نام همان ایمیل، نقش مدیر سامانه می‌گیرد (ایمیل خارج از مخزن تنظیم می‌شود).
  if (env.ADMIN_EMAIL && normalizeEmail(env.ADMIN_EMAIL) === email) {
    await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?1, 'super_admin')").bind(userId).run();
  }

  // ارسال ناموفق کاربر را خطا نمی‌بیند (پاسخ عمومی)؛ کاربر می‌تواند از /api/auth/resend-verification استفاده کند.
  await issueVerificationEmail(env, userId, email);
  return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
}

/**
 * توکن تأیید تازه می‌سازد و ایمیل را می‌فرستد. خطای ارسال فقط در لاگ ثبت می‌شود
 * (بدون مقادیر حساس)، تا پاسخ عمومی ثبت‌نام یا ارسال مجدد تغییر نکند.
 * @returns {Promise<boolean>} true اگر ایمیل با موفقیت به سرویس ارسال داده شد.
 */
async function issueVerificationEmail(env, userId, email) {
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
      subject: 'تأیید حساب آکادمی وکالت شهرام مختاری',
      text: `برای تأیید حساب خود روی لینک زیر کلیک کنید (تا ۳۰ دقیقه معتبر است):\n${link}\n\nاگر شما درخواست نکرده‌اید، این پیام را نادیده بگیرید.`,
    });
    return true;
  } catch (err) {
    logError('auth.send_verification', err);
    return false;
  }
}

/**
 * ارسال مجدد ایمیل تأیید. پاسخ همیشه عمومی است تا وجود حساب فاش نشود.
 * ایمیل فقط برای حساب فعال و تأییدنشده و با فاصلهٔ حداقل یک دقیقه فرستاده می‌شود.
 * لینک‌های تأیید قبلی باطل می‌شوند تا فقط آخرین لینک معتبر باشد.
 */
export async function resendVerification(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.body?.email);
  if (!email) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { email: 'نشانی ایمیل معتبر نیست.' } }, 422);

  const generic = () => json({ ok: true, message: RESEND_MSG }, 202);
  const user = await env.DB
    .prepare('SELECT id, status, email_verified_at FROM users WHERE email = ?1')
    .bind(email)
    .first();
  if (!user) {
    logOutcome('auth.resend', 'no_account');
    return generic();
  }
  if (user.status !== 'active') {
    logOutcome('auth.resend', 'not_active');
    return generic();
  }
  if (user.email_verified_at) {
    logOutcome('auth.resend', 'already_verified');
    return generic();
  }

  const recent = await env.DB
    .prepare("SELECT created_at FROM email_tokens WHERE user_id = ?1 AND purpose = 'verify_email' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(user.id)
    .first();
  if (recent && Date.now() - Date.parse(recent.created_at) < RESEND_COOLDOWN_MS) {
    logOutcome('auth.resend', 'cooldown');
    return generic();
  }

  await env.DB
    .prepare("UPDATE email_tokens SET used_at = ?1 WHERE user_id = ?2 AND purpose = 'verify_email' AND used_at IS NULL")
    .bind(new Date().toISOString(), user.id)
    .run();
  const sent = await issueVerificationEmail(env, user.id, email);
  logOutcome('auth.resend', sent ? 'sent' : 'send_failed');
  return generic();
}

async function insertProfile(env, userId, p) {
  await env.DB
    .prepare(`INSERT INTO user_profiles (user_id, phone, province, city, professional_status, bar_association,
        license_number, license_year, experience_band, practice_areas, learning_goal, skill_areas, skill_level,
        learning_format, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`)
    .bind(userId, p.phone, p.province, p.city, p.professionalStatus, p.barAssociation, p.licenseNumber,
      p.licenseYear, p.experienceBand, JSON.stringify(p.practiceAreas), p.learningGoal,
      JSON.stringify(p.skillAreas), p.skillLevel, p.learningFormat, p.notes)
    .run();
}

export async function getProfile(env, userId) {
  let row;
  try {
    row = await env.DB
      .prepare(`SELECT phone, province, city, professional_status, bar_association, license_number, license_year,
        experience_band, practice_areas, learning_goal, skill_areas, skill_level, learning_format, notes
        FROM user_profiles WHERE user_id = ?1`)
      .bind(userId)
      .first();
  } catch (err) {
    // نبود جدول پروفایل نباید صفحهٔ حساب کاربران قدیمی را از کار بیندازد.
    logError('me.profile_lookup', err);
    return null;
  }
  if (!row) return null;
  return {
    phone: row.phone,
    province: row.province,
    city: row.city,
    professionalStatus: row.professional_status,
    barAssociation: row.bar_association,
    licenseNumber: row.license_number,
    licenseYear: row.license_year,
    experienceBand: row.experience_band,
    practiceAreas: JSON.parse(row.practice_areas || '[]'),
    learningGoal: row.learning_goal,
    skillAreas: JSON.parse(row.skill_areas || '[]'),
    skillLevel: row.skill_level,
    learningFormat: row.learning_format,
    notes: row.notes,
  };
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
  // پروفایل فقط به خود کاربر نمایش داده می‌شود (این مسیر فقط برای کاربر وارد شده است).
  const profile = await getProfile(env, user.id);
  return json({ ok: true, user: { ...user, profile } });
}
