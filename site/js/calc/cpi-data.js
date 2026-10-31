// شاخص بهای کالاها و خدمات مصرفی در مناطق شهری ایران (مبنا: ۱۴۰۰=۱۰۰)، منتشرشده از سوی بانک مرکزی جمهوری اسلامی ایران.
// فقط ارقامی که در متن گزارش‌ها به‌صورت صریح آمده‌اند ثبت شده‌اند. ارقام جداول تصویری تا تطبیق دستی وارد نشده‌اند.
// هیچ شاخصی جایگزین یا تخمینی ساخته نمی‌شود. محاسبهٔ تعدیل فقط با مبنای قانونی هر محاسبه‌گر مجاز است (در این فایل نیست).

export const CPI_STATUS = Object.freeze({
  SOURCE_READ: 'source_read', // از فایل رسمی خوانده شده؛ هنوز مبنای قانونی یک محاسبه‌گر تعیین نشده است.
});

export const CPI_RECORDS = Object.freeze([
  Object.freeze({
    period: 'تیر ۱۴۰۵',
    periodKey: '1405-04',
    publishedAt: 'مرداد ۱۴۰۵',
    source: 'خلاصه نتایج شاخص بهای کالاها و خدمات مصرفی در مناطق شهری ایران، تیرماه ۱۴۰۵',
    sourceFile: '7edefd51-_______________.pdf',
    page: 1,
    index: 742.8,
    monthlyChangePct: 3.6,
    yearOverYearChangePct: 83.9,
    twelveMonthChangePct: 61.4,
    base: '۱۴۰۰=۱۰۰',
    status: CPI_STATUS.SOURCE_READ,
  }),
  Object.freeze({
    period: 'شهریور ۱۴۰۵',
    periodKey: '1405-06',
    publishedAt: 'مهر ۱۴۰۵',
    source: 'خلاصه نتایج شاخص بهای کالاها و خدمات مصرفی در مناطق شهری ایران، شهریورماه ۱۴۰۵',
    sourceFile: '1a46bdcb-_____________________.pdf',
    page: 1,
    index: 800.0,
    monthlyChangePct: 3.9,
    yearOverYearChangePct: 83.8,
    twelveMonthChangePct: 68.4,
    base: '۱۴۰۰=۱۰۰',
    status: CPI_STATUS.SOURCE_READ,
  }),
]);

export function cpiFor(periodKey) {
  return CPI_RECORDS.find((r) => r.periodKey === periodKey) || null;
}
