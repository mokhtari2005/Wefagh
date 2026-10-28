// منطق محاسبه‌گرها. خالص، بدون DOM، قابل تست.
// هر محاسبه یک rule_version و مراحل قابل بازبینی برمی‌گرداند. نرخ یا قاعدهٔ قانونی در این فایل ثبت نشده است؛
// نرخ‌ها را کاربر وارد می‌کند تا زمانی که منبع رسمی تأیید شود.

export const RULE_VERSION = '0.1.0';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

/** @returns {string|null} تاریخ جدید به‌صورت YYYY-MM-DD */
export function addDays(isoDate, days) {
  const base = parseIsoDate(isoDate);
  if (!base || !Number.isInteger(days) || days < 0 || days > 3650) return null;
  return toIso(new Date(base.getTime() + days * DAY_MS));
}

/** @returns {number|null} تعداد روز بین دو تاریخ (end - start) */
export function daysBetween(startIso, endIso) {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  if (!s || !e) return null;
  return Math.round((e - s) / DAY_MS);
}

/**
 * مهلت: از تاریخ ابلاغ، به‌تعداد روز مشخص.
 * تعطیلات رسمی و قاعدهٔ شروع مهلت در این نسخه اعمال نمی‌شوند؛ خروجی همیشه این محدودیت را نشان می‌دهد.
 */
export function deadline({ noticeDate, days }) {
  const last = addDays(noticeDate, days);
  if (!last) return { ok: false, error: 'INVALID_INPUT' };
  return {
    ok: true,
    ruleVersion: RULE_VERSION,
    lastDay: last,
    steps: [
      `تاریخ ابلاغ: ${noticeDate}`,
      `مدت مهلت: ${days} روز`,
      `آخرین روز = تاریخ ابلاغ + ${days} روز = ${last}`,
    ],
    limitations: [
      'تعطیلات رسمی و تعطیلات آخر هفته در این محاسبه کنار گذاشته نشده‌اند.',
      'قاعدهٔ قانونی شروع مهلت (روز ابلاغ یا روز بعد) باید توسط وکیل تأیید شود.',
      'این عدد پیش‌نویس است و تأیید نهایی تاریخ با وکیل پرونده است.',
    ],
  };
}

/**
 * خسارت تأخیر تأدیه به‌روش ساده: اصل × نرخ سالانه × روز / ۳۶۵.
 * نرخ را کاربر وارد می‌کند؛ نرخ قانونی در این نسخه ثبت نشده است.
 */
export function delayInterest({ principal, ratePercent, startDate, endDate }) {
  const days = daysBetween(startDate, endDate);
  if (days === null || days < 0) return { ok: false, error: 'INVALID_DATES' };
  if (typeof principal !== 'number' || !Number.isFinite(principal) || principal <= 0) {
    return { ok: false, error: 'INVALID_PRINCIPAL' };
  }
  if (typeof ratePercent !== 'number' || !Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    return { ok: false, error: 'INVALID_RATE' };
  }
  const interest = Math.round((principal * (ratePercent / 100) * days) / 365);
  return {
    ok: true,
    ruleVersion: RULE_VERSION,
    days,
    interest,
    total: principal + interest,
    steps: [
      `اصل دین: ${principal}`,
      `نرخ سالانه (وارد‌شده توسط کاربر): ${ratePercent}٪`,
      `تعداد روز از ${startDate} تا ${endDate}: ${days}`,
      `خسارت = اصل × نرخ × روز ÷ ۳۶۵ = ${interest}`,
    ],
    limitations: [
      'نرخ وارد‌شده باید از منبع رسمی و مربوط به همان دورهٔ تأخیر باشد؛ این نسخه نرخ قانونی را نمی‌داند.',
      'اگر نرخ در دوره تغییر کرده، محاسبه باید به تفکیک دوره انجام شود (در این نسخه پشتیبانی نمی‌شود).',
      'عدد بالا پیش‌نویس است و پیش از ارائه به دادگاه یا طرف مقابل باید بازبینی شود.',
    ],
  };
}
