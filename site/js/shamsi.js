// قالب‌بندی تاریخ شمسی با Intl (تقویم فارسی). بدون کتابخانه.

const LOCALE = 'fa-IR-u-ca-persian';

/**
 * @param {Date|string|number} value
 * @param {{ withTime?: boolean }} [options]
 * @returns {string} مثل «۵ آبان ۱۴۰۵»
 */
export function formatShamsi(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const opts = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' };
  if (options.withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
  }
  return new Intl.DateTimeFormat(LOCALE, opts).format(date);
}
