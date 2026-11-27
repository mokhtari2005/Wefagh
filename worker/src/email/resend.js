// ارسال ایمیل تراکنشی از طریق Resend API؛ بدون SMTP و بدون وابستگی خارجی.
const SEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Mokhtari Law Academy <edu@mokhtari.ir>';
const SAFE_CODE = /^[A-Za-z_]{1,60}$/;

/**
 * @param {{env:{RESEND_API_KEY:string,RESEND_FROM?:string},to:string,subject:string,text:string,fetchImpl?:typeof fetch}} args
 */
export async function sendMail({ env, to, subject, text, fetchImpl = fetch }) {
  const missing = ['RESEND_API_KEY'].filter((name) => !env[name]);
  if (missing.length) {
    const err = new Error('MAIL_NOT_CONFIGURED');
    err.missing = missing;
    throw err;
  }
  const from = env.RESEND_FROM || DEFAULT_FROM;
  if (/[\r\n]/.test(from) || /[\r\n]/.test(to) || /[\r\n]/.test(subject)) {
    throw new Error('INVALID_MAIL_HEADER');
  }
  const res = await fetchImpl(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    const err = new Error('RESEND_SEND_FAILED');
    err.status = res.status;
    try {
      const data = await res.json();
      const code = typeof data?.name === 'string' ? data.name
        : typeof data?.statusCode === 'string' ? data.statusCode : '';
      if (SAFE_CODE.test(code)) err.reason = code;
    } catch {
      // پاسخ غیر JSON؛ فقط وضعیت HTTP ثبت می‌شود.
    }
    throw err;
  }
  return { ok: true };
}
