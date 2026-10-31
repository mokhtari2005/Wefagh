// خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی. خالص و بدون DOM.
//
// مبنای حقوقی (وضعیت احراز): ماده ۵۲۲ قانون آیین دادرسی مدنی. متن رسمی ماده و شرایط اجرایی آن
// در این محیط احراز نشده است؛ منبع ثانوی فقط می‌گوید این خسارت بر اساس شاخص اعلامی بانک مرکزی است.
// بنابراین محاسبه فقط وقتی انجام می‌شود که کاربر همهٔ شرایط زیر را صریحاً تأیید کرده باشد.
//
// فرمول: خسارت = اصل دین × (شاخص ماه پایان ÷ شاخص ماه شروع − ۱)
// شاخص ماه شروع و پایان از جدول cpi-data.js و فقط از داده‌های گزارش رسمی گرفته می‌شود.

import { cpiFor, cpiCoverage, CPI_SOURCE } from './cpi-data.js';
import { parseShamsiInput } from '../jalali.js';

/** شرایطی که کاربر باید همه را تأیید کند؛ اگر یکی تأیید نشود، محاسبه انجام نمی‌شود. */
export const INDEXATION_CONDITIONS = Object.freeze([
  { id: 'monetaryDebt', label: 'موضوع، دین پولی است (وجه نقد یا مبلغ ریالی محکوم‌به یا مطالبه‌شده).' },
  { id: 'dueDate', label: 'سررسید یا تاریخ مطالبه مشخص است و تأخیر از همان تاریخ شروع شده است.' },
  { id: 'noContrary', label: 'توافق طرفین یا قانون خاصی روش دیگری تعیین نکرده است.' },
  { id: 'article522', label: 'موضوع مشمول ماده ۵۲۲ قانون آیین دادرسی مدنی است و شرایط اجرایی آن احراز شده است.' },
]);

/** «۱۴۰۵/۰۴/۰۸» → «1405-04» یا null؛ از تاریخ شمسی ورودی فقط سال و ماه را نگه می‌دارد. */
export function periodKeyOfShamsi(text) {
  const iso = parseShamsiInput(text);
  if (!iso) return null;
  return periodKeyOfIso(iso);
}

/** «2026-07-30» → «1405-05»؛ تبدیل میلادی به کلید ماه شمسی. */
export function periodKeyOfIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (![y, m, d].every(Number.isInteger)) return null;
  // تبدیل با تقویم فارسی مرورگر/Node (Intl) از طریق jalali.js
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const parts = fmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const jy = Number(parts.find((p) => p.type === 'year')?.value);
  const jm = Number(parts.find((p) => p.type === 'month')?.value);
  if (!jy || !jm) return null;
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

/** «1405-04» → «تیر ۱۴۰۵» برای نمایش. */
const MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const FA = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
export function periodLabel(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${FA(y)}`;
}

function periodOrder(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return y * 12 + m;
}

/**
 * @param {{ principal:number, startIso:string, endIso:string, confirmed:Record<string,boolean> }} input
 *   startIso/endIso: تاریخ میلادی YYYY-MM-DD (از ورودی شمسی تبدیل شده).
 */
export function indexedDelayDamage({ principal, startIso, endIso, confirmed = {} }) {
  if (typeof principal !== 'number' || !Number.isFinite(principal) || principal <= 0) {
    return { ok: false, error: 'INVALID_PRINCIPAL' };
  }
  const startKey = periodKeyOfIso(startIso);
  const endKey = periodKeyOfIso(endIso);
  if (!startKey || !endKey) return { ok: false, error: 'INVALID_DATES' };
  if (periodOrder(endKey) < periodOrder(startKey)) return { ok: false, error: 'INVALID_PERIOD' };

  const missingConditions = INDEXATION_CONDITIONS.filter((c) => confirmed[c.id] !== true).map((c) => c.label);
  if (missingConditions.length > 0) return { ok: false, error: 'CONDITIONS_NOT_CONFIRMED', missingConditions };

  const { first, last } = cpiCoverage();
  const start = cpiFor(startKey);
  const end = cpiFor(endKey);
  const missingKeys = [startKey, endKey].filter((k) => !cpiFor(k));
  if (missingKeys.length > 0) {
    return { ok: false, error: 'NO_INDEX_DATA', missingKeys, coverage: { first, last } };
  }

  const ratio = end.index / start.index;
  const damage = Math.round(principal * (ratio - 1));
  const total = principal + damage;
  const steps = [
    `اصل دین: ${principal}`,
    `شاخص ماه شروع (${periodLabel(startKey)}): ${start.index} — منبع: ${CPI_SOURCE.shortTitle}`,
    `شاخص ماه پایان (${periodLabel(endKey)}): ${end.index} — منبع: ${CPI_SOURCE.shortTitle}`,
    `ضریب تعدیل = ${end.index} ÷ ${start.index} = ${ratio.toFixed(6)}`,
    `خسارت = اصل × (ضریب − ۱) = ${damage}`,
  ];
  return {
    ok: true,
    principal,
    startIndex: { periodKey: startKey, period: periodLabel(startKey), index: start.index, source: CPI_SOURCE.title },
    endIndex: { periodKey: endKey, period: periodLabel(endKey), index: end.index, source: CPI_SOURCE.title },
    ratio,
    interest: damage,
    total,
    steps,
    coverage: { first, last },
  };
}
