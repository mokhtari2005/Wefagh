// تاریخ و ساعت تهران برای یادآوری‌ها. ایران از ۱۴۰۱ ساعت تابستانی ندارد؛ آفست ثابت ‎+۰۳:۳۰ است.
import { isoToShamsiInput } from '../../../site/js/jalali.js';

const TEHRAN_OFFSET_MIN = 210;
const FA = '۰۱۲۳۴۵۶۷۸۹';

export function toFa(value) {
  return String(value).replace(/\d/g, (d) => FA[Number(d)]);
}

/** @returns {{date:string, hour:number}} تاریخ میلادی (YYYY-MM-DD) و ساعت فعلی تهران */
export function tehranNow(now = new Date()) {
  const shifted = new Date(now.getTime() + TEHRAN_OFFSET_MIN * 60_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

/** «2026-11-15» ⇒ «۱۴۰۵/۰۸/۲۴» */
export function shamsiLabel(iso) {
  try {
    return toFa(isoToShamsiInput(iso));
  } catch {
    return String(iso);
  }
}
