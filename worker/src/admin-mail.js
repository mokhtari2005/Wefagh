// تشخیص ارسال ایمیل برای مدیر سامانه: وضعیت Secretها، بررسی توکن Gmail و ارسال ایمیل آزمایشی.
// مقدار هیچ Secretی در پاسخ یا لاگ نمی‌آید؛ فقط نام متغیرهای خالی و کد ساده‌شدهٔ خطای Google.
import { json } from './http.js';
import { currentUser, logError } from './auth/routes.js';
import { getAccessToken, sendMail } from './email/gmail.js';

const REQUIRED = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM'];

/** راهنمای فارسی برای کدهای رایج خطا؛ فقط متن ثابت. */
export function hintFor(err) {
  if (err?.message === 'MAIL_NOT_CONFIGURED') {
    return `این Secretها در Worker تعریف نشده‌اند: ${(err.missing || []).join('، ')}.`;
  }
  const reason = err?.reason;
  if (reason === 'invalid_grant') {
    return 'Refresh token باطل یا منقضی شده است. اگر برنامهٔ OAuth در Google Cloud در حالت Testing است، توکن بعد از ۷ روز باطل می‌شود: برنامه را به Production ببرید و توکن تازه بسازید.';
  }
  if (reason === 'invalid_client' || reason === 'unauthorized_client') {
    return 'GMAIL_CLIENT_ID یا GMAIL_CLIENT_SECRET درست نیست یا با توکن همخوانی ندارد.';
  }
  if (err?.message === 'GMAIL_SEND_FAILED' && (err.status === 403 || err.status === 401)) {
    return 'دسترسی ارسال رد شد: Gmail API را در پروژهٔ Google Cloud فعال کنید و scope مربوط به gmail.send را هنگام ساخت توکن بدهید.';
  }
  if (err?.message === 'GMAIL_SEND_FAILED' && err.status === 400) {
    return 'پیام رد شد: نشانی GMAIL_FROM باید همان حساب مجاز (یا یک alias تأییدشده) باشد.';
  }
  return 'علت دقیق‌تر در لاگ Worker (auth.send_verification یا admin.mail) ثبت شده است.';
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

/**
 * GET  /api/admin/mail/status[?probe=1] ← وضعیت تنظیمات و (اختیاری) بررسی دریافت access token
 * POST /api/admin/mail/test             ← ارسال ایمیل آزمایشی به نشانی خود مدیر
 */
export async function handleAdminMail(request, env, path) {
  if (path !== '/api/admin/mail/status' && path !== '/api/admin/mail/test') return null;
  const wantsGet = path === '/api/admin/mail/status';
  if (request.method !== (wantsGet ? 'GET' : 'POST')) {
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: wantsGet ? 'GET' : 'POST' });
  }
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;
  const fetchImpl = env.fetchImpl ?? fetch;

  if (wantsGet) {
    const missing = REQUIRED.filter((n) => !env[n]);
    const out = {
      ok: true,
      configured: missing.length === 0,
      missing,
      baseUrl: env.PUBLIC_BASE_URL || env.BASE_URL || 'https://mokhtari.ir',
    };
    if (missing.length === 0 && new URL(request.url).searchParams.get('probe') === '1') {
      try {
        await getAccessToken({
          clientId: env.GMAIL_CLIENT_ID,
          clientSecret: env.GMAIL_CLIENT_SECRET,
          refreshToken: env.GMAIL_REFRESH_TOKEN,
          fetchImpl,
        });
        out.probe = { ok: true };
      } catch (err) {
        logError('admin.mail.probe', err);
        out.probe = failure(err);
      }
    } else if (missing.length > 0) {
      out.hint = `این Secretها در Worker تعریف نشده‌اند: ${missing.join('، ')}.`;
    }
    return json(out);
  }

  try {
    const send = env.mailer ?? ((args) => sendMail({ env, fetchImpl, ...args }));
    await send({
      to: access.user.email,
      subject: 'ایمیل آزمایشی وِفاق',
      text: 'اگر این پیام را می‌بینید، ارسال ایمیل از سامانه درست کار می‌کند.',
    });
    return json({ ok: true });
  } catch (err) {
    logError('admin.mail.test', err);
    return json(failure(err), 502);
  }
}
