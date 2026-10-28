// تبدیل تاریخ شمسی ⇄ میلادی بدون کتابخانه. تبدیل با تقویم فارسی مرورگر (Intl) انجام می‌شود تا با نمایش یکسان باشد.
// ورودی‌ها به‌صورت «YYYY/MM/DD» شمسی؛ خروجی میلادی به‌صورت «YYYY-MM-DD».

const DAY_MS = 24 * 60 * 60 * 1000;
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const JALALI_FMT = new Intl.DateTimeFormat('en-u-ca-persian', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

function jalaliPartsOfUtcNoon(date) {
  const parts = JALALI_FMT.formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { jy: get('year'), jm: get('month'), jd: get('day') };
}

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند. */
export function normalizeDigits(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * @returns {string|null} تاریخ میلادی YYYY-MM-DD یا null اگر تاریخ شمسی معتبر نباشد.
 */
export function shamsiToIso(jy, jm, jd) {
  if (![jy, jm, jd].every(Number.isInteger)) return null;
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  // نقطهٔ شروع نزدیک به ۱ فروردین همان سال؛ سپس روز به روز تا تطابق کامل جست‌وجو می‌شود.
  const start = Date.UTC(jy + 621, 2, 21, 12);
  for (let off = -10; off <= 400; off += 1) {
    const d = new Date(start + off * DAY_MS);
    const p = jalaliPartsOfUtcNoon(d);
    if (p.jy === jy && p.jm === jm && p.jd === jd) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** «۱۴۰۵/۰۸/۰۶» یا «1405-8-6» → «2026-10-28» یا null */
export function parseShamsiInput(text) {
  const m = normalizeDigits(text)
    .trim()
    .match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const jy = Number(m[1]);
  // سال شمسی باید در بازهٔ منطقی باشد تا تاریخ میلادی مثل 2026-10-28 به‌اشتباه شمسی خوانده نشود.
  if (jy < 1300 || jy > 1500) return null;
  return shamsiToIso(jy, Number(m[2]), Number(m[3]));
}

/** «2026-10-28» → «1405/08/06» */
export function isoToShamsiInput(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const p = jalaliPartsOfUtcNoon(new Date(Date.UTC(y, m - 1, d, 12)));
  return `${p.jy}/${String(p.jm).padStart(2, '0')}/${String(p.jd).padStart(2, '0')}`;
}
