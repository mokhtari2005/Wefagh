// ارسال ایمیل از طریق Gmail API با OAuth (refresh token). فقط fetch؛ بدون SMTP.
// اطلاعات حساس (client secret و refresh token) از secret های Worker خوانده می‌شوند.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// عنوان فارسی را در RFC 2047 (UTF-8 base64) کد می‌کند.
export function encodeHeaderUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** کنترل ساده برای جلوگیری از تزریق هدر (CRLF). */
function assertSafeHeader(value, name) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) {
    throw new Error(`INVALID_HEADER_${name.toUpperCase()}`);
  }
}

export function buildRawMessage({ from, to, subject, text }) {
  assertSafeHeader(from, 'from');
  assertSafeHeader(to, 'to');
  assertSafeHeader(subject, 'subject');
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderUtf8(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(String.fromCharCode(...new TextEncoder().encode(text))),
  ];
  return toBase64Url(lines.join('\r\n'));
}

export async function getAccessToken({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw await providerError('GMAIL_TOKEN_FAILED', res);
  const data = await res.json();
  if (!data.access_token) throw new Error('GMAIL_TOKEN_MISSING');
  return data.access_token;
}

/**
 * @param {{ env: {GMAIL_CLIENT_ID:string, GMAIL_CLIENT_SECRET:string, GMAIL_REFRESH_TOKEN:string, GMAIL_FROM:string},
 *           to: string, subject: string, text: string, fetchImpl?: typeof fetch }} args
 */
export async function sendMail({ env, to, subject, text, fetchImpl = fetch }) {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN || !env.GMAIL_FROM) {
    throw new Error('MAIL_NOT_CONFIGURED');
  }
  const accessToken = await getAccessToken({
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
    refreshToken: env.GMAIL_REFRESH_TOKEN,
    fetchImpl,
  });
  const raw = buildRawMessage({ from: env.GMAIL_FROM, to, subject, text });
  const res = await fetchImpl(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw await providerError('GMAIL_SEND_FAILED', res);
  return { ok: true };
}

// دلیل خطای Google فقط اگر یک کد ساده (حروف و _) باشد ثبت می‌شود؛ هرگز متن آزاد یا توکن.
const SAFE_REASON = /^[A-Za-z_]{1,40}$/;

/**
 * خطای قابل‌لاگ: پیام ثابت کد خطا، وضعیت HTTP، و کد دلیل Google (در صورت امن بودن).
 * بدنهٔ پاسخ هرگز در پیام خطا نمی‌رود.
 */
async function providerError(code, res) {
  const err = new Error(code);
  err.status = res.status;
  try {
    const data = await res.json();
    // ترتیب: دلیل دقیق‌تر Gmail، سپس کد کلی Gmail، و کد OAuth (invalid_grant و...).
    const candidates = [
      typeof data?.error?.errors?.[0]?.reason === 'string' ? data.error.errors[0].reason : null,
      typeof data?.error?.status === 'string' ? data.error.status : null,
      typeof data?.error === 'string' ? data.error : null,
    ];
    const reason = candidates.find((c) => c && SAFE_REASON.test(c));
    if (reason) err.reason = reason;
  } catch {
    // بدنهٔ غیر JSON: فقط وضعیت HTTP ثبت می‌شود.
  }
  return err;
}
