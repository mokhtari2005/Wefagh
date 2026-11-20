// تمبر مالیاتی و سهم کانون، صندوق و مرکز وکلا. خالص و بدون DOM.
// هر سهم مستقل از مبنای خودش محاسبه می‌شود؛ هیچ سهمی از سهم دیگری کسر یا مشتق نمی‌شود.

export const STAMP_RATE = 0.05;      // تمبر مالیاتی: ۵٪ مبنا
export const KANON_FUND_RATE = 0.5; // سهم صندوق حمایت وکلا: ۵۰٪ مبلغ تمبر
export const KANON_RATE = 0.25;     // سهم کانون وکلای دادگستری: ۲۵٪ مبلغ تمبر
export const MARKAZ_RATE = 0.05;    // سهم مرکز وکلا: ۵٪ حق‌الوکاله (نه مبلغ تمبر)

const round = (n) => Math.round(n);
const nonNegative = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * @param {object} input
 * @param {number} input.tariffFee  حق‌الوکالهٔ تعرفه‌ای (حداقل قانونی مبنا) به ریال.
 * @param {number} [input.received] مبلغ علی‌الحساب دریافتی از موکل به ریال (اختیاری).
 * @param {'kanon'|'markaz'|''} [input.license] نوع پروانه؛ بدون آن فقط تمبر محاسبه می‌شود.
 */
export function computeStampAndShares({ tariffFee, received = 0, license = '' }) {
  if (!Number.isFinite(tariffFee) || tariffFee <= 0) return { ok: false, error: 'FEE_REQUIRED' };

  const receivedAmount = nonNegative(received);
  const stampFromReceived = round(receivedAmount * STAMP_RATE);
  const stampLegalMinimum = round(tariffFee * STAMP_RATE);
  const stamp = Math.max(stampFromReceived, stampLegalMinimum);
  const basisLabel = stampFromReceived > stampLegalMinimum
    ? 'مبلغ علی‌الحساب دریافتی از موکل'
    : 'حداقل قانونی (۵٪ حق‌الوکاله تعرفه‌ای)';

  const shares = [];
  if (license === 'kanon') {
    shares.push({ label: 'سهم صندوق حمایت وکلا (۵۰٪ مبلغ تمبر)', amount: round(stamp * KANON_FUND_RATE) });
    shares.push({ label: 'سهم کانون وکلای دادگستری (۲۵٪ مبلغ تمبر)', amount: round(stamp * KANON_RATE) });
  } else if (license === 'markaz') {
    shares.push({ label: 'سهم مرکز وکلا (۵٪ حق‌الوکاله)', amount: round(tariffFee * MARKAZ_RATE) });
  }

  return {
    ok: true,
    license: license || null,
    receivedAmount,
    stampFromReceived,
    stampLegalMinimum,
    stamp,
    basisLabel,
    shares,
  };
}
