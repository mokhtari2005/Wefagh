// تمبر مالیاتی و سهم کانون، صندوق و مرکز وکلا. خالص و بدون DOM.
// مبنای تمبر و سهم مرکز یکی است:
//   مبنا = حداکثرِ (حداقل تعرفهٔ همان مرحله، مبلغی که واقعاً دریافت شده)
//   - اگر کل حق‌الوکالهٔ توافقی دریافت شده باشد، «مبلغی که دریافت شده» همان مبلغ توافقی است؛
//   - در غیر این صورت، همان مبلغ علی‌الحساب دریافتی است.
// حق‌الوکالهٔ توافقی به‌تنهایی مبنا نیست.
// تمبر = ۵٪ مبنا؛ سهم کانون = ۲۵٪ تمبر؛ سهم صندوق حمایت = ۵۰٪ تمبر؛ سهم مرکز = ۵٪ مبنا.

export const STAMP_RATE = 0.05;     // تمبر مالیاتی: ۵٪ مبنا
export const KANON_FUND_RATE = 0.5; // سهم صندوق حمایت وکلا: ۵۰٪ مبلغ تمبر
export const KANON_RATE = 0.25;     // سهم کانون وکلای دادگستری: ۲۵٪ مبلغ تمبر
export const MARKAZ_RATE = 0.05;    // سهم مرکز وکلا: ۵٪ مبنا

const round = (n) => Math.round(n);
const nonNegative = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * @param {object} input
 * @param {number} input.stageFee  حق‌الوکالهٔ تعرفه‌ای همان مرحله به ریال (حداقل قانونی).
 * @param {number} [input.agreedFee] حق‌الوکالهٔ توافقی سهم همان مرحله به ریال.
 * @param {number} [input.receivedFee] مبلغ علی‌الحساب واقعاً دریافت‌شدهٔ سهم همان مرحله به ریال.
 * @param {boolean} [input.fullyReceived] آیا کل حق‌الوکالهٔ توافقی دریافت شده است.
 * @param {'kanon'|'markaz'|''} [input.license] نوع پروانه؛ بدون آن فقط تمبر محاسبه می‌شود.
 */
export function computeStampAndShares({ stageFee, agreedFee = 0, receivedFee = 0, fullyReceived = false, license = '' }) {
  if (!Number.isFinite(stageFee) || stageFee <= 0) return { ok: false, error: 'FEE_REQUIRED' };

  const tariffFee = round(stageFee);
  const agreedAmount = round(nonNegative(agreedFee));
  const receivedAmount = round(nonNegative(receivedFee));
  const paidAmount = fullyReceived && agreedAmount > 0 ? agreedAmount : receivedAmount;
  const stampBase = Math.max(tariffFee, paidAmount);
  const stamp = round(stampBase * STAMP_RATE);
  let basisLabel = 'حداقل قانونی تعرفه همان مرحله';
  if (stampBase > tariffFee) {
    basisLabel = fullyReceived && agreedAmount > 0
      ? 'حق‌الوکالهٔ توافقی (کل آن دریافت شده)'
      : 'مبلغ علی‌الحساب واقعاً دریافت‌شده';
  }

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
    receivedAmount,
    fullyReceived: Boolean(fullyReceived && agreedAmount > 0),
    stampBase,
    stamp,
    basisLabel,
    shares,
  };
}
