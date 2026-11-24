// خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی. خالص و بدون DOM.
//
// مبنای محاسبه: رأی وحدت رویه شماره ۸۵۰ مورخ ۱۴۰۳/۰۵/۱۶.
// شاخص سالانه بانک مرکزی در قالب جدول ماهانه منتشر می‌شود؛ برای هر تاریخ، شاخص همان ماه
// انتخاب و نسبت شاخص زمان پرداخت به شاخص زمان سررسید/مطالبه محاسبه می‌شود.
// این روش با اعمال نرخ تورم ماهانه یا متوسط شاخص سال تقویمی تفاوت دارد.
//
// فرمول: مبلغ روز دین = اصل دین × (شاخص سالانه ماه پرداخت ÷ شاخص سالانه ماه شروع)
// خسارت = مبلغ روز دین − اصل دین.
// داده‌ها فقط از جدول cpi-data.js خوانده می‌شوند؛ هیچ ماهی درون‌یابی یا تخمین زده نمی‌شود.

import { cpiFor, cpiCoverage, CPI_SOURCE } from './cpi-data.js';

/** نکاتی که باید پیش از استفاده از عدد احراز شود؛ همیشه در خروجی نمایش داده می‌شوند. */
export const LEGAL_VERIFICATION_POINTS = Object.freeze([
  'مبنای فرمول، رأی وحدت رویه شماره ۸۵۰ مورخ ۱۴۰۳/۰۵/۱۶ است: شاخص سالانه بانک مرکزی که در جدول ماهانه منتشر می‌شود، نه نرخ تورم ماهانه و نه متوسط شاخص سال تقویمی.',
  'در دیون غیرچکی، شرایط ماده ۵۲۲ از جمله وجه رایج بودن دین، مطالبه طلبکار، تمکن مدیون، امتناع از پرداخت و تغییر فاحش شاخص باید در پرونده احراز شود.',
  'در چک، مبدأ اصولاً تاریخ سررسید چک است؛ قانون خاص صدور چک، رأی وحدت رویه شماره ۸۱۲ و مفاد حکم پرونده باید لحاظ شود.',
  'اگر توافق معتبر طرفین یا قانون خاص، مبنای دیگری مقرر کرده باشد، این محاسبه به‌تنهایی کافی نیست.',
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
    formula: 'مبلغ روز دین = اصل دین × (شاخص سالانه ماه پرداخت ÷ شاخص سالانه ماه شروع)؛ خسارت = مبلغ روز دین − اصل دین',
    interest: damage,
    total,
    steps: [
      `اصل دین: ${principal} ریال`,
      `ماه شروع (${startBasis}): ${periodLabel(startKey)}، شاخص سالانهٔ درج‌شده در جدول ماهانهٔ بانک مرکزی: ${start.index}`,
      `ماه پایان (${endBasis}): ${periodLabel(endKey)}، شاخص سالانهٔ درج‌شده در جدول ماهانهٔ بانک مرکزی: ${end.index}`,
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
