// خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی. خالص و بدون DOM.
//
// وضعیت حقوقی (احراز نشده):
//   - ماده ۵۲۲ قانون آیین دادرسی مدنی: متن رسمی و شرایط اجرایی آن در این محیط بررسی نشده است.
//   - تاریخ شروع (سررسید یا مطالبه) و تاریخ پایان، انتخاب کاربر است و مبنای قانونی آن تأیید نشده است.
//   - ملاک ماه‌های شروع و پایان (ماه تقویمی تاریخ‌ها) تأیید نشده است.
// بنابراین خروجی همیشه «محاسبهٔ مشروط» است و احراز شرایط قانونی را کاربر یا وکیل باید انجام دهد.
//
// فرمول: خسارت = اصل دین × (شاخص ماه پایان ÷ شاخص ماه شروع − ۱)
// شاخص‌ها فقط از جدول cpi-data.js (گزارش رسمی بانک مرکزی) خوانده می‌شوند؛ هیچ ماهی درون‌یابی نمی‌شود.

import { cpiFor, cpiCoverage, CPI_SOURCE } from './cpi-data.js';

/** نکاتی که باید پیش از استفاده از عدد احراز شود؛ همیشه در خروجی نمایش داده می‌شوند. */
export const LEGAL_VERIFICATION_POINTS = Object.freeze([
  'تاریخ شروع تأخیر (سررسید یا مطالبه) باید بر اساس قرارداد یا حکم و مستند حقوقی انتخاب شود؛ این ابزار آن را تعیین نمی‌کند.',
  'اینکه ماده ۵۲۲ قانون آیین دادرسی مدنی بر این دین پولی و این مرحله اعمال می‌شود، باید احراز شود؛ متن رسمی و شرایط اجرایی آن در این ابزار بررسی نشده است.',
  'اگر توافق طرفین یا قانون خاصی روش دیگری تعیین کرده باشد، این محاسبه معتبر نیست.',
  'ملاک ماه‌های شروع و پایان (ماه تقویمی تاریخ‌ها) باید توسط وکیل تأیید شود.',
]);

const MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const FA = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** «2026-07-22» → «1405-04»؛ تبدیل میلادی به کلید ماه شمسی با تقویم فارسی (Intl). */
export function periodKeyOfIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (![y, m, d].every(Number.isInteger)) return null;
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const parts = fmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const jy = Number(parts.find((p) => p.type === 'year')?.value);
  const jm = Number(parts.find((p) => p.type === 'month')?.value);
  if (!jy || !jm) return null;
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

/** «1405-04» → «تیر ۱۴۰۵» */
export function periodLabel(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${FA(y)}`;
}

function periodOrder(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return y * 12 + m;
}

/**
 * تعیین تاریخ پایان بر اساس وضعیت پرداخت. پرداخت جزئی پشتیبانی نمی‌شود و صریحاً رد می‌شود.
 * @param {{ startIso:string, calcIso:string, payment:{status:'unpaid'|'full'|'partial', dateIso?:string} }} input
 */
export function planDelayPeriod({ startIso, calcIso, payment }) {
  if (!startIso || !calcIso) return { ok: false, error: 'INVALID_DATES' };
  if (!payment || !['unpaid', 'full', 'partial'].includes(payment.status)) return { ok: false, error: 'INVALID_PAYMENT' };
  if (payment.status === 'partial') return { ok: false, error: 'PARTIAL_PAYMENT_UNSUPPORTED' };
  if (payment.status === 'full') {
    if (!payment.dateIso) return { ok: false, error: 'INVALID_DATES' };
    return { ok: true, endIso: payment.dateIso, endBasis: 'تاریخ پرداخت کامل' };
  }
  return { ok: true, endIso: calcIso, endBasis: 'تاریخ محاسبه' };
}

/**
 * @param {{ principal:number, startIso:string, endIso:string, startBasis?:string, endBasis?:string }} input
 *   startIso/endIso: تاریخ میلادی YYYY-MM-DD؛ startBasis/endBasis فقط برای نمایش است.
 */
export function indexedDelayDamage({ principal, startIso, endIso, startBasis = 'تاریخ شروع انتخاب‌شده', endBasis = 'تاریخ پایان انتخاب‌شده' }) {
  if (typeof principal !== 'number' || !Number.isFinite(principal) || principal <= 0) {
    return { ok: false, error: 'INVALID_PRINCIPAL' };
  }
  const startKey = periodKeyOfIso(startIso);
  const endKey = periodKeyOfIso(endIso);
  if (!startKey || !endKey) return { ok: false, error: 'INVALID_DATES' };
  if (periodOrder(endKey) < periodOrder(startKey)) return { ok: false, error: 'INVALID_PERIOD' };

  const { first, last } = cpiCoverage();
  const missing = [startKey, endKey].filter((k) => !cpiFor(k));
  if (missing.length > 0) {
    const outside = missing.map((k) => ({ periodKey: k, side: periodOrder(k) < periodOrder(first) ? 'before' : 'after' }));
    return { ok: false, error: 'NO_INDEX_DATA', missingKeys: missing, outside, coverage: { first, last } };
  }

  const start = cpiFor(startKey);
  const end = cpiFor(endKey);
  const ratio = end.index / start.index;
  const damage = Math.round(principal * (ratio - 1));
  const total = principal + damage;
  return {
    ok: true,
    principal,
    referenceMonth: periodLabel(startKey),
    startIndex: { periodKey: startKey, period: periodLabel(startKey), index: start.index, basis: startBasis, publishedAt: start.publishedAt, pdfPage: start.pdfPage },
    endIndex: { periodKey: endKey, period: periodLabel(endKey), index: end.index, basis: endBasis, publishedAt: end.publishedAt, pdfPage: end.pdfPage },
    ratio,
    formula: 'خسارت = اصل دین × (شاخص ماه پایان ÷ شاخص ماه شروع − ۱)',
    interest: damage,
    total,
    steps: [
      `اصل دین: ${principal} ریال`,
      `ماه شروع (${startBasis}): ${periodLabel(startKey)}، شاخص ${start.index}`,
      `ماه پایان (${endBasis}): ${periodLabel(endKey)}، شاخص ${end.index}`,
      `ضریب تعدیل = ${end.index} ÷ ${start.index} = ${ratio.toFixed(6)}`,
      `خسارت = ${principal} ریال × (${ratio.toFixed(6)} − ۱) = ${damage} ریال`,
      `جمع اصل و خسارت = ${total} ریال`,
    ],
    source: {
      title: CPI_SOURCE.title,
      publisher: CPI_SOURCE.publisher,
      reportPublishedAt: CPI_SOURCE.reportPublishedAt,
      file: CPI_SOURCE.file,
      startPage: start.pdfPage,
      endPage: end.pdfPage,
    },
    coverage: { first, last },
    requiredVerification: LEGAL_VERIFICATION_POINTS,
  };
}
