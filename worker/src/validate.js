// اعتبارسنجی ورودی‌ها. خالص و بدون وابستگی؛ در Node و Worker یکسان اجرا می‌شود.

export const CONTACT_TOPICS = Object.freeze([
  'general', // پرسش عمومی
  'consulting', // مشاوره حقوقی
  'academy', // آکادمی و آموزش
  'media', // رسانه و پادکست
  'cooperative', // مشارکت صنفی
  'other', // سایر
]);

export const LIMITS = Object.freeze({
  nameMin: 2,
  nameMax: 100,
  emailMax: 254,
  messageMin: 10,
  messageMax: 2000,
});

// الگوی ساده و معقول برای ایمیل (کنترل دقیق RFC لازم نیست؛ تأیید واقعی با ارسال ایمیل است).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// کاراکترهای کنترلی را حذف می‌کند و فاصله‌های اضافه را جمع می‌کند.
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// cleanMultiline خطوط را حفظ می‌کند ولی کاراکترهای کنترلی را حذف می‌کند.
export function cleanMultiline(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: {name:string,email:string,topic:string,message:string} } | { ok: false, errors: Record<string,string> }}
 */
export function validateContact(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: { body: 'درخواست نامعتبر است.' } };
  }

  const name = cleanText(body.name);
  const email = cleanText(body.email).toLowerCase();
  const topic = cleanText(body.topic) || 'general';
  const message = cleanMultiline(body.message);

  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    errors.name = `نام باید بین ${LIMITS.nameMin} و ${LIMITS.nameMax} نویسه باشد.`;
  }
  if (email.length > LIMITS.emailMax || !EMAIL_RE.test(email)) {
    errors.email = 'نشانی ایمیل معتبر نیست.';
  }
  if (!CONTACT_TOPICS.includes(topic)) {
    errors.topic = 'موضوع انتخاب‌شده معتبر نیست.';
  }
  if (message.length < LIMITS.messageMin || message.length > LIMITS.messageMax) {
    errors.message = `متن پیام باید بین ${LIMITS.messageMin} و ${LIMITS.messageMax} نویسه باشد.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, email, topic, message } };
}
