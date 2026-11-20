// تمبر مالیاتی و سهم کانون، صندوق و مرکز وکلا. خالص و بدون DOM.
// هر سهم مستقل از مبنای خودش محاسبه می‌شود؛ هیچ سهمی از سهم دیگری کسر یا مشتق نمی‌شود.
//
// مبنای تمبر: حق‌الوکالهٔ درج‌شده در وکالت‌نامه، با رعایت حداقل قانونی (۵٪ حق‌الوکالهٔ تعرفه‌ای).
// مبنای سهم مرکز: مبلغ علی‌الحساب دریافتی از موکل (ماده ۳ آیین‌نامه).
// سهم‌های کانون و صندوق: از مبلغ تمبر محاسبه می‌شوند.

export const STAMP_RATE = 0.05;      // تمبر مالیاتی: ۵٪ مبنا
export const KANON_FUND_RATE = 0.5; // سهم صندوق حمایت وکلا: ۵۰٪ مبلغ تمبر
export const KANON_RATE = 0.25;     // سهم کانون وکلای دادگستری: ۲۵٪ مبلغ تمبر
export const MARKAZ_RATE = 0.05;    // سهم مرکز وکلا: ۵٪ مبلغ علی‌الحساب دریافتی

const round = (n) => Math.round(n);
const nonNegative = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * @param {object} input
 * @param {number} input.tariffFee  حق‌الوکالهٔ تعرفه‌ای (حداقل قانونی مبنا) به ریال.
 * @param {number} [input.agreedFee] حق‌الوکالهٔ درج‌شده در وکالت‌نامه به ریال (اختیاری).
 * @param {number} [input.received] مبلغ علی‌الحساب دریافتی از موکل به ریال (اختیاری).
 * @param {'kanon'|'markaz'|''} [input.license] نوع پروانه؛ بدون آن فقط تمبر محاسبه می‌شود.
 */
export function computeStampAndShares({ tariffFee, agreedFee = 0, received = 0, license = '' }) {
  if (!Number.isFinite(tariffFee) || tariffFee <= 0) return { ok: false, error: 'FEE_REQUIRED' };

  const agreed = nonNegative(agreedFee);
  const receivedAmount = nonNegative(received);
  const stampFromAgreed = round(agreed * STAMP_RATE);
  const stampLegalMinimum = round(tariffFee * STAMP_RATE);
  const stamp = Math.max(stampFromAgreed, stampLegalMinimum);
  const basisLabel = stampFromAgreed > stampLegalMinimum
    ? 'حق‌الوکالهٔ درج‌شده در وکالت‌نامه'
    : 'حداقل قانونی (۵٪ حق‌الوکاله تعرفه‌ای)';

  const shares = [];
  if (license === 'kanon') {
    shares.push({ label: 'سهم صندوق حمایت وکلا (۵۰٪ مبلغ تمبر)', amount: round(stamp * KANON_FUND_RATE) });
    shares.push({ label: 'سهم کانون وکلای دادگستری (۲۵٪ مبلغ تمبر)', amount: round(stamp * KANON_RATE) });
  } else if (license === 'markaz') {
    shares.push({ label: 'سهم مرکز وکلا (۵٪ مبلغ علی‌الحساب دریافتی)', amount: round(receivedAmount * MARKAZ_RATE) });
  }

  return {
    ok: true,
    license: license || null,
    agreedAmount: agreed,
    receivedAmount,
    stampFromAgreed,
    stampLegalMinimum,
    stamp,
    basisLabel,
    shares,
  };
}
