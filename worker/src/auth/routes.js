// مسیرهای احراز هویت: ثبت‌نام، تأیید ایمیل، ورود، خروج و /api/me.
// اصول: پاسخ‌ها طوری‌اند که وجود یا عدم وجود یک ایمیل را فاش نکنند؛ رمزها هرگز ذخیره یا لاگ نمی‌شوند.
import { json, readJsonBody, readCookie, sessionCookie, SESSION_COOKIE } from '../http.js';
import { cleanText, normalizeEmail } from '../validate.js';
import { hashPassword, verifyPassword, validatePasswordPolicy } from './password.js';
import { generateToken, hashToken, addMs, SESSION_TTL_MS, EMAIL_TOKEN_TTL_MS } from './token.js';
import { sendMail } from '../email/resend.js';

/** گزارش فنی بدون داده‌های کاربر: فقط نام خطا و محل آن (هرگز ایمیل، رمز یا پروفایل). */
export function logError(where, err) {
  const entry = { where, error: err?.name || 'Error', detail: String(err?.message || '').slice(0, 200) };
  if (Number.isInteger(err?.status)) entry.status = err.status;
  if (typeof err?.reason === 'string' && /^[A-Za-z_]{1,40}$/.test(err.reason)) entry.reason = err.reason;
  if (Array.isArray(err?.missing)) {
    entry.missing = err.missing.filter((n) => typeof n === 'string' && /^(?:RESEND|GMAIL)_[A-Z_]{1,40}$/.test(n));
  }
  console.error(JSON.stringify(entry));
}

/** رویداد عملیاتی بدون ایمیل یا توکن؛ فقط دلیل بازگشت ارسال مجدد. */
function logOutcome(where, outcome) {
  console.info(JSON.stringify({ where, outcome }));
}

async function membershipApproved(db, userId) {
  try {
    const row = await db.prepare('SELECT membership_status FROM users WHERE id = ?1').bind(userId).first();
    return !row?.membership_status || row.membership_status === 'approved';
  } catch (err) {
    if (String(err?.message || '').includes('no such column')) return true;
    throw err;
  }
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
  // در تست‌ها env.mailer جایگزین می‌شود؛ در حالت واقعی از Resend استفاده می‌شود.
  return env.mailer ?? ((args) => sendMail({ env, ...args }));
}

function publicBaseUrl(env) {
  // دامنهٔ اصلی mokhtari.ir است؛ مقدار از تنظیمات Worker خوانده می‌شود.
  return env.PUBLIC_BASE_URL || env.BASE_URL || 'https://mokhtari.ir';
}

export async function register(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body && typeof parsed.body === 'object' ? parsed.body : {};

  const email = normalizeEmail(body.email);
  const displayName = cleanText(body.displayName);
  const professionalTitle = cleanText(body.professionalTitle);
  const position = cleanText(body.position);
  const gender = body.gender;
  const phone = String(body.phone || '').replace(/[۰-۹٠-٩]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d) >= 0 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(d) : '٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s\-‌()]/g, '');
  const errors = {};
  if (!email) errors.email = 'نشانی ایمیل معتبر نیست.';
  const pol = validatePasswordPolicy(body.password);
  if (!pol.ok) errors.password = pol.error;
  if (displayName.length < 2 || displayName.length > 100) errors.displayName = 'نام و نام خانوادگی باید بین ۲ و ۱۰۰ نویسه باشد.';
  const hasContactDetails = body.gender !== undefined || body.phone !== undefined;
  if (professionalTitle && (professionalTitle.length < 2 || professionalTitle.length > 100)) errors.professionalTitle = 'عنوان معتبر نیست.';
  if (position && (position.length < 2 || position.length > 100)) errors.position = 'سمت معتبر نیست.';
  if (hasContactDetails) {
    if (!['male', 'female'].includes(gender)) errors.gender = 'جنسیت را انتخاب کنید.';
    if (!['lawyer', 'trainee', 'law_student', 'law_graduate', 'professor', 'researcher', 'other'].includes(position)) errors.position = 'سمت را از فهرست انتخاب کنید.';
    if (!['academy_member', 'academy_instructor', 'academy_researcher', 'guest_member', 'other'].includes(professionalTitle)) errors.professionalTitle = 'عنوان را از فهرست انتخاب کنید.';
    if (!/^09\d{9}$/.test(phone)) errors.phone = 'شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود.';
  }
  if (Object.keys(errors).length > 0) return json({ ok: false, error: 'VALIDATION_FAILED', errors }, 422);

  const existing = await env.DB.prepare('SELECT id, status, email_verified_at, membership_status FROM users WHERE email = ?1').bind(email).first();
  if (existing?.membership_status === 'rejected') {
    // رد قبلی نباید ایمیل را برای همیشه مسدود کند: همان حساب با حفظ شناسه و شماره عضویت، درخواست تازه می‌دهد.
    // نشست‌ها و توکن‌های قبلی باطل و تأیید ایمیل و بررسی عضویت از ابتدا انجام می‌شود.
    try {
      await env.DB.prepare(`UPDATE users SET password_hash=?1, display_name=?2, gender=?3, phone=?4,
        professional_title=?5, position=?6, status='active', membership_status='pending',
        email_verified_at=NULL, failed_logins=0, locked_until=NULL WHERE id=?7`)
        .bind(await hashPassword(body.password), displayName, gender || null, phone || null,
          professionalTitle, position, existing.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(existing.id).run();
      await env.DB.prepare("UPDATE email_tokens SET used_at=?1 WHERE user_id=?2 AND purpose='verify_email' AND used_at IS NULL")
        .bind(new Date().toISOString(), existing.id).run();
    } catch (err) {
      if (String(err?.message || '').includes('users.phone')) {
        return json({ ok: false, error: 'PHONE_ALREADY_EXISTS', errors: { phone: 'این شماره تلفن همراه قبلاً ثبت شده است.' } }, 409);
      }
      logError('register.reapply_rejected', err);
      return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
    }
    const sent = await issueVerificationEmail(env, existing.id, email);
    logOutcome('auth.register_rejected_reapply', sent ? 'mail_sent' : 'mail_failed');
    return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
  }
  if (existing) {
    if (existing.status === 'active' && !existing.email_verified_at) {
      const outcome = await resendForUser(env, existing.id, email);
      logOutcome('auth.register_existing', outcome);
    }
    return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
  }
  const passwordHash = await hashPassword(body.password);
  let userId;
  try {
    let row;
    try {
      row = await env.DB
        .prepare("INSERT INTO users (email, password_hash, display_name, gender, phone, professional_title, position, membership_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending') RETURNING id")
        .bind(email, passwordHash, displayName, gender || null, phone || null, professionalTitle, position)
        .first();
    } catch (schemaError) {
      // سازگاری با نسخه‌های قدیمی دیتابیس تا اجرای مهاجرت ۰۰۲۵.
      if (!/no such column|has no column named/i.test(String(schemaError?.message || ''))) throw schemaError;
      try {
        row = await env.DB.prepare("INSERT INTO users (email, password_hash, display_name, membership_status) VALUES (?1, ?2, ?3, 'pending') RETURNING id")
          .bind(email, passwordHash, displayName).first();
      } catch (legacySchemaError) {
        if (!/no such column|has no column named/i.test(String(legacySchemaError?.message || ''))) throw legacySchemaError;
        row = await env.DB.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?1, ?2, ?3) RETURNING id')
          .bind(email, passwordHash, displayName).first();
      }
    }
    userId = row?.id;
    if (userId) {
      let membershipSequence = 1999 + Number(userId);
      try {
        // شمارندهٔ دیتابیس تخصیص هم‌زمان شماره‌ها را بدون تکرار مدیریت می‌کند.
        const allocated = await env.DB.prepare(
          'UPDATE membership_sequence SET next_value = next_value + 1 WHERE id = 1 RETURNING next_value - 1 AS value'
        ).bind().first();
        if (Number.isInteger(allocated?.value)) membershipSequence = allocated.value;
      } catch (sequenceError) {
        // سازگاری موقت با محیط‌هایی که هنوز مهاجرت ۰۰۱۹ را اجرا نکرده‌اند.
        if (!String(sequenceError?.message || '').includes('no such table')) throw sequenceError;
      }
      const membershipNo = `MLA-${membershipSequence}`;
      try {
        await env.DB.prepare('UPDATE users SET membership_no=?1, professional_title=?2, position=?3 WHERE id=?4').bind(membershipNo, professionalTitle, position, userId).run();
        try {
          await env.DB.prepare("UPDATE users SET membership_status='pending' WHERE id=?1").bind(userId).run();
        } catch (membershipSchemaError) {
          if (!/no such column|has no column named/i.test(String(membershipSchemaError?.message || ''))) throw membershipSchemaError;
        }
      } catch (identityError) {
        // سازگاری با محیط‌های آزمایشی یا نسخه‌های قدیمی DB تا زمان اجرای مهاجرت ۰۰۱۴.
        if (!String(identityError?.message || '').includes('no such column')) throw identityError;
      }
    }
  } catch (err) {
    // ثبت همزمان دو درخواست با یک ایمیل: پاسخ عمومی؛ سایر خطاها به کاربر نشان داده نمی‌شوند.
    if (String(err?.message || '').includes('users.phone')) return json({ ok: false, error: 'PHONE_ALREADY_EXISTS', errors: { phone: 'این شماره تلفن همراه قبلاً ثبت شده است.' } }, 409);
    if (String(err?.message || '').includes('UNIQUE')) return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
    logError('register.insert_user', err);
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }

  // ادمین اصلی با ثبت‌نام همان ایمیل، نقش مدیر سامانه می‌گیرد (ایمیل خارج از مخزن تنظیم می‌شود).
  if (env.ADMIN_EMAIL && normalizeEmail(env.ADMIN_EMAIL) === email) {
    await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?1, 'super_admin')").bind(userId).run();
  }

  // ارسال ناموفق کاربر را خطا نمی‌بیند (پاسخ عمومی)؛ کاربر می‌تواند از /api/auth/resend-verification استفاده کند.
  const sent = await issueVerificationEmail(env, userId, email);
  logOutcome('auth.register', sent ? 'mail_sent' : 'mail_failed');
  return json({ ok: true, message: GENERIC_REGISTER_MSG }, 202);
}

/**
 * توکن تأیید تازه می‌سازد و ایمیل را می‌فرستد. خطای ارسال فقط در لاگ ثبت می‌شود
 * (بدون مقادیر حساس)، تا پاسخ عمومی ثبت‌نام یا ارسال مجدد تغییر نکند.
 * @returns {Promise<boolean>} true اگر ایمیل با موفقیت به سرویس ارسال داده شد.
 */
const POSITION_LABELS = Object.freeze({
  lawyer: 'وکیل محترم دادگستری',
  trainee: 'کارآموز محترم وکالت',
  law_student: 'دانشجوی محترم حقوق',
  law_graduate: 'فارغ‌التحصیل محترم رشته حقوق',
  professor: 'استاد محترم دانشگاه',
  researcher: 'پژوهشگر محترم حقوق',
  other: 'فعال محترم حوزه حقوق',
});

export function buildVerificationEmailText({ displayName, gender, position, link }) {
  const name = cleanText(displayName) || 'عضو گرامی';
  const honorific = gender === 'male' ? 'جناب آقای' : gender === 'female' ? 'سرکار خانم' : '';
  const positionLabel = POSITION_LABELS[position] || cleanText(position);
  const salutation = [honorific, name].filter(Boolean).join(' ');
  const professionalLine = positionLabel || 'عضو ارجمند آکادمی';
  return [
    'با سلام و احترام،',
    '',
    `${salutation}، ${professionalLine}`,
    '',
    'از ثبت‌نام شما در آکادمی وکالت شهرام مختاری سپاسگزاریم.',
    'برای تأیید نشانی ایمیل و تکمیل مرحله نخست ثبت‌نام، لطفاً روی پیوند زیر کلیک کنید:',
    link,
    '',
    'پس از تأیید ایمیل، درخواست عضویت شما برای بررسی مدیر آکادمی ارسال می‌شود. خواهشمندیم تا اعلام نتیجه و تأیید نهایی عضویت از سوی مدیر آکادمی شکیبا باشید.',
    'توجه داشته باشید تأیید ایمیل به‌تنهایی به معنای تأیید نهایی عضویت نیست.',
    '',
    'با احترام،',
    'آکادمی وکالت شهرام مختاری',
    '',
    'اگر شما درخواست ثبت‌نام نداده‌اید، این پیام را نادیده بگیرید.',
    'پیوند تأیید تا ۳۰ دقیقه معتبر است.',
  ].join('\n');
}

async function issueVerificationEmail(env, userId, email) {
  const token = generateToken();
  const now = new Date();
  await env.DB
    .prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await hashToken(token), userId, 'verify_email', addMs(now, EMAIL_TOKEN_TTL_MS))
    .run();

  const link = `${publicBaseUrl(env)}/#/verify?token=${token}`;
  try {
    const identity = await env.DB.prepare(
      'SELECT display_name, gender, position FROM users WHERE id = ?1'
    ).bind(userId).first();
    await mailer(env)({
      to: email,
      subject: 'تأیید ایمیل و تکمیل درخواست عضویت | آکادمی وکالت شهرام مختاری',
      text: buildVerificationEmailText({
        displayName: identity?.display_name,
        gender: identity?.gender,
        position: identity?.position,
        link,
      }),
    });
    return true;
  } catch (err) {
    logError('auth.send_verification', err);
    return false;
  }
}

/** ارسال کنترل‌شدهٔ لینک تأیید برای حساب موجود؛ خروجی فقط برای لاگ داخلی است. */
async function resendForUser(env, userId, email) {
  const recent = await env.DB
    .prepare("SELECT created_at FROM email_tokens WHERE user_id = ?1 AND purpose = 'verify_email' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(userId)
    .first();
  const elapsed = recent ? Date.now() - Date.parse(recent.created_at) : Infinity;
  if (recent && elapsed < RESEND_COOLDOWN_MS) return 'cooldown';

  await env.DB
    .prepare("UPDATE email_tokens SET used_at = ?1 WHERE user_id = ?2 AND purpose = 'verify_email' AND used_at IS NULL")
    .bind(new Date().toISOString(), userId)
    .run();
  const sent = await issueVerificationEmail(env, userId, email);
  return sent ? 'sent' : 'send_failed';
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

  const outcome = await resendForUser(env, user.id, email);
  logOutcome('auth.resend', outcome);
  return generic();
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
  const membershipOk = user ? await membershipApproved(env.DB, user.id) : false;
  if (!user || !passOk || user.status !== 'active' || !membershipOk) {
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
  if (!(await membershipApproved(env.DB, row.id))) return null;
  let identity = {};
  try {
    identity = await env.DB.prepare('SELECT membership_no, professional_title, position FROM users WHERE id=?1').bind(row.id).first() || {};
  } catch (identityError) {
    if (!String(identityError?.message || '').includes('no such column')) throw identityError;
  }
  const roleRows = await env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ?1').bind(row.id).all();
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    membershipNo: identity.membership_no || `MLA-${1999 + Number(row.id)}`,
    professionalTitle: identity.professional_title || '',
    position: identity.position || '',
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
