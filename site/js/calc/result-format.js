// قالب‌بندی مشترک نتیجهٔ محاسبه‌گرها. خالص و بدون DOM تا قابل آزمون باشد.

/** محدودیت‌ها همیشه فهرستی از رشته‌های کامل‌اند. رشتهٔ تنها یک مورد است، نه فهرست حروف. */
export function normalizeLimitations(value) {
  if (value === null || value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((x) => typeof x === 'string')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

/** همهٔ عددهای لاتین داخل مرحله را به رقم فارسی و جداکنندهٔ هزارگان فارسی تبدیل می‌کند (مثلاً 2.5 → ۲٫۵). */
export function formatNumbersInLine(line) {
  return String(line).replace(/\d+(\.\d+)?/g, (m) => Number(m).toLocaleString('fa-IR'));
}

/** مبلغ ریالی برای نمایش؛ واحد همیشه صریح است. */
export function formatRial(amount) {
  return `${Number(amount).toLocaleString('fa-IR')} ریال`;
}

/** برچسب وضعیت قاعده برای سربرگ نتیجه. */
export function statusLabel(status) {
  switch (status) {
    case 'verified':
      return { text: 'احراز شده', tone: 'ok' };
    case 'user_approved':
      return { text: 'تأیید کاربر (غیررسمی)', tone: 'warn' };
    case 'text_read':
      return { text: 'نیازمند بررسی حقوقی', tone: 'warn' };
    default:
      return { text: 'محاسبه‌شده', tone: 'neutral' };
  }
}
