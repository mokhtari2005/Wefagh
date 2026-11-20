// تمبر مالیاتی و سهم کانون، صندوق و مرکز وکلا. خالص و بدون DOM.
// مبنای تمبر و مبنای سهم مرکز یکی است: حق‌الوکالهٔ تعرفه‌ای همان مرحله؛
// اگر حق‌الوکالهٔ درج‌شده در وکالت‌نامه (سهم همان مرحله) از تعرفه بیشتر باشد، همان ملاک است.
// مبلغ علی‌الحساب دریافتی در مبنا نقشی ندارد.
// تمبر = ۵٪ مبنا؛ سهم کانون = ۲۵٪ تمبر؛ سهم صندوق حمایت = ۵۰٪ تمبر؛ سهم مرکز = ۵٪ مبنا.

export const STAMP_RATE = 0.05;     // تمبر مالیاتی: ۵٪ مبنا
export const KANON_FUND_RATE = 0.5; // سهم صندوق حمایت وکلا: ۵۰٪ مبلغ تمبر
export const KANON_RATE = 0.25;     // سهم کانون وکلای دادگستری: ۲۵٪ مبلغ تمبر
export const MARKAZ_RATE = 0.05;    // سهم مرکز وکلا: ۵٪ مبنا

const round = (n) => Math.round(n);
const nonNegative = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * @param {object} input
 * @param {number} input.stageFee  حق‌الوکالهٔ تعرفه‌ای همان مرحله به ریال.
 * @param {number} [input.agreedFee] حق‌الوکالهٔ توافقی سهم همان مرحله به ریال (اختیاری).
 * @param {'kanon'|'markaz'|''} [input.license] نوع پروانه؛ بدون آن فقط تمبر محاسبه می‌شود.
 */
export function computeStampAndShares({ stageFee, agreedFee = 0, license = '' }) {
  if (!Number.isFinite(stageFee) || stageFee <= 0) return { ok: false, error: 'FEE_REQUIRED' };

  const tariffFee = round(stageFee);
  const agreedAmount = round(nonNegative(agreedFee));
  const stampBase = Math.max(tariffFee, agreedAmount);
  const stamp = round(stampBase * STAMP_RATE);
  const basisLabel = agreedAmount > tariffFee
    ? 'حق‌الوکالهٔ توافقی درج‌شده در وکالت‌نامه'
    : 'حق‌الوکالهٔ تعرفه‌ای همان مرحله';

  const shares = [];
  if (license === 'kanon') {
    shares.push({ label: 'سهم صندوق حمایت وکلا (۵۰٪ مبلغ تمبر)', amount: round(stamp * KANON_FUND_RATE) });
    shares.push({ label: 'سهم کانون وکلای دادگستری (۲۵٪ مبلغ تمبر)', amount: round(stamp * KANON_RATE) });
  } else if (license === 'markaz') {
    shares.push({ label: 'سهم مرکز وکلا (۵٪ مبنا)', amount: round(stampBase * MARKAZ_RATE) });
  }

  return {
    ok: true,
    license: license || null,
    stageFee: tariffFee,
    agreedAmount,
    stampBase,
    stamp,
    basisLabel,
    shares,
  };
}
