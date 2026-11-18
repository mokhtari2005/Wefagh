// تشخیص واقعی مسیر ایمیل ثبت‌نام (Resend) و بررسی وضعیت حساب فقط برای مدیر مجاز.
import { json, readJsonBody } from './http.js';
import { currentUser, logError, resendVerification } from './auth/routes.js';
import { normalizeEmail } from './validate.js';
import { sendMail } from './email/resend.js';

const REQUIRED = ['RESEND_API_KEY'];

export function hintFor(err) {
  if (err?.message === 'MAIL_NOT_CONFIGURED') return 'Secret با نام RESEND_API_KEY در تنظیمات همین Cloudflare Worker تعریف نشده است.';
  if (err?.message === 'RESEND_SEND_FAILED' && (err.status === 401 || err.status === 403)) return 'Resend کلید API را نپذیرفت؛ اعتبار کلید و دسترسی آن را در داشبورد Resend بررسی کنید.';
  if (err?.message === 'RESEND_SEND_FAILED' && err.status === 422) return 'Resend پیام را نپذیرفت؛ دامنهٔ فرستنده و تأیید دامنه در Resend و نشانی گیرنده را بررسی کنید.';
  if (err?.message === 'RESEND_SEND_FAILED' && err.status === 429) return 'محدودیت نرخ یا سهمیهٔ ارسال Resend فعال شده است؛ کمی بعد دوباره تلاش کنید.';
  if (err?.message === 'RESEND_SEND_FAILED' && err.status >= 500) return 'سرویس Resend موقتاً پاسخ‌گو نیست؛ کمی بعد دوباره تلاش کنید.';
  return 'جزئیات امن خطا در لاگ Worker با عنوان admin.mail ثبت شده است.';
}

function failure(err) {
  return {
    ok: false,
    error: 'MAIL_FAILED',
    code: String(err?.message || 'Error').slice(0, 60),
    ...(Number.isInteger(err?.status) ? { status: err.status } : {}),
    ...(typeof err?.reason === 'string' ? { reason: err.reason } : {}),
    ...(Array.isArray(err?.missing) ? { missing: err.missing } : {}),
    hint: hintFor(err),
  };
}

export async function requireMailAdmin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ ok: false, error: 'UNAUTHENTICATED' }, 401) };
  if (!user.roles.some((r) => r === 'admin' || r === 'super_admin')) return { response: json({ ok: false, error: 'FORBIDDEN' }, 403) };
  return { user };
}

async function readAccount(env, email) {
  return env.DB.prepare('SELECT id, status, email_verified_at AS emailVerifiedAt FROM users WHERE email = ?1').bind(email).first();
}
async function verificationCooldown(env, userId) {
  const recent = await env.DB.prepare("SELECT created_at AS createdAt FROM email_tokens WHERE user_id = ?1 AND purpose = 'verify_email' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(userId).first();
  if (!recent) return { allowed: true, retryAfterSeconds: 0, lastSentAt: null };
  const elapsed = Date.now() - Date.parse(recent.createdAt);
  const retryAfterSeconds = Math.max(0, Math.ceil((60_000 - elapsed) / 1000));
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds, lastSentAt: recent.createdAt };
}

/**
 * GET  /api/admin/mail/status
 * POST /api/admin/mail/test
 * POST /api/admin/mail/account-status  {email}
 * POST /api/admin/mail/account-resend {email}
 */
export async function handleAdminMail(request, env, path) {
  const paths = ['/api/admin/mail/status', '/api/admin/mail/test', '/api/admin/mail/account-status', '/api/admin/mail/account-resend'];
  if (!paths.includes(path)) return null;
  const wantsGet = path === '/api/admin/mail/status';
  if (request.method !== (wantsGet ? 'GET' : 'POST')) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: wantsGet ? 'GET' : 'POST' });
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;
  const fetchImpl = env.fetchImpl ?? fetch;

  if (path === '/api/admin/mail/status') {
    const missing = REQUIRED.filter((n) => !env[n]);
    return json({
      ok: true,
      configured: missing.length === 0,
      missing,
      senderConfigured: Boolean(env.RESEND_FROM),
      baseUrl: env.PUBLIC_BASE_URL || env.BASE_URL || 'https://mokhtari.ir',
      hint: missing.length ? `Secretهای لازم در Worker موجود نیست: ${missing.join('، ')}.` : 'کلید Resend در Worker موجود است؛ برای اطمینان از اعتبار کلید و دامنه، ایمیل آزمایشی ارسال کنید.',
    });
  }

  if (path === '/api/admin/mail/test') {
    try {
      const send = env.mailer ?? ((args) => sendMail({ env, fetchImpl, ...args }));
      await send({ to: access.user.email, subject: 'ایمیل آزمایشی آکادمی وکالت', text: 'اگر این پیام را می‌بینید، مسیر واقعی ارسال ایمیل ثبت‌نام (Resend) درست کار می‌کند.' });
      return json({ ok: true, provider: 'Resend' });
    } catch (err) {
      logError('admin.mail.test', err);
      return json(failure(err), 502);
    }
  }

  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.body?.email);
  if (!email) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);

  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const account = await readAccount(env, email);
  if (path === '/api/admin/mail/account-status') {
    if (!account) return json({ ok: true, found: false });
    const cooldown = await verificationCooldown(env, account.id);
    return json({
      ok: true,
      found: true,
      status: account.status,
      verified: Boolean(account.emailVerifiedAt),
      resendAllowed: account.status === 'active' && !account.emailVerifiedAt && cooldown.allowed,
      retryAfterSeconds: cooldown.retryAfterSeconds,
      lastSentAt: cooldown.lastSentAt,
    });
  }

  if (!account) return json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, 404);
  if (account.status !== 'active') return json({ ok: false, error: 'ACCOUNT_INACTIVE' }, 409);
  if (account.emailVerifiedAt) return json({ ok: false, error: 'EMAIL_ALREADY_VERIFIED' }, 409);
  const cooldown = await verificationCooldown(env, account.id);
  if (!cooldown.allowed) return json({ ok: false, error: 'RESEND_COOLDOWN', retryAfterSeconds: cooldown.retryAfterSeconds }, 429);
  const internalRequest = new Request('https://internal.invalid/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return resendVerification(internalRequest, env);
}
