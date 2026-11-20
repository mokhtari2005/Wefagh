// تمبر مالیاتی و سهم کانون، صندوق و مرکز وکلا. خالص و بدون DOM.
// هر سهم مستقل از مبنای خودش محاسبه می‌شود؛ هیچ سهمی از سهم دیگری کسر یا مشتق نمی‌شود.
//
// تمبر مالیاتی (ماده ۳ آیین‌نامه و نظریات مشورتی ۷/۱۴۰۰/۱۰۰۲، ۷/۱۴۰۰/۱۴۶۶ و ۷/۱۴۰۲/۲۹):
//   مبنا = حداکثرِ (مبلغ علی‌الحساب واقعاً دریافت‌شده، حداقل تعرفه قانونی همان مرحله)
//   تمبر = ۵٪ مبنا
// سهم مرکز: ۵٪ مبلغ علی‌الحساب دریافتی (بدون جایگزینی با حداقل تعرفه).
// سهم کانون: ۲۵٪ مبلغ تمبر؛ سهم صندوق حمایت: ۵۰٪ مبلغ تمبر.
// حق‌الوکالهٔ درج‌شده در وکالت‌نامه به‌تنهایی مبنا نیست؛ فقط یادآور می‌شود اگر کامل دریافت نشده باشد.

export const STAMP_RATE = 0.05;     // تمبر مالیاتی: ۵٪ مبنا
export const KANON_FUND_RATE = 0.5; // سهم صندوق حمایت وکلا: ۵۰٪ مبلغ تمبر
export const KANON_RATE = 0.25;     // سهم کانون وکلای دادگستری: ۲۵٪ مبلغ تمبر
export const MARKAZ_RATE = 0.05;    // سهم مرکز وکلا: ۵٪ مبلغ علی‌الحساب دریافتی

const round = (n) => Math.round(n);
const nonNegative = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * @param {object} input
 * @param {number} input.stageFee  حق‌الوکالهٔ تعرفه‌ای همان مرحله (حداقل قانونی مبنا) به ریال.
 * @param {number} [input.received] مبلغ علی‌الحساب واقعاً دریافت‌شده از موکل به ریال (اختیاری).
 * @param {number} [input.agreedFee] حق‌الوکالهٔ درج‌شده در وکالت‌نامه به ریال (اختیاری؛ فقط یادآور).
 * @param {'kanon'|'markaz'|''} [input.license] نوع پروانه؛ بدون آن فقط تمبر محاسبه می‌شود.
 */
export function computeStampAndShares({ stageFee, received = 0, agreedFee = 0, license = '' }) {
  if (!Number.isFinite(stageFee) || stageFee <= 0) return { ok: false, error: 'FEE_REQUIRED' };

  const receivedAmount = nonNegative(received);
  const agreedAmount = nonNegative(agreedFee);
  const legalMinimum = round(stageFee);
  const stampBase = Math.max(receivedAmount, legalMinimum);
  const stamp = round(stampBase * STAMP_RATE);
  const basisLabel = receivedAmount > legalMinimum
    ? 'مبلغ علی‌الحساب دریافتی از موکل'
    : 'حداقل قانونی تعرفه همان مرحله';
  const agreedNotFullyReceived = agreedAmount > 0 && receivedAmount < agreedAmount;

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
    stageFee: legalMinimum,
    receivedAmount,
    agreedAmount,
    agreedNotFullyReceived,
    stampBase,
    stamp,
    basisLabel,
    shares,
  };
}
