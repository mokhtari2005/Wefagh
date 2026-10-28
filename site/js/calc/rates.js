// قواعد نرخ هزینه‌ها، به‌تفکیک سال. هر قاعده منبع، تاریخ‌ها و وضعیت احراز دارد.
//
// وضعیت:
//   'unverified' ⇒ هنوز از متن رسمی احراز نشده؛ محاسبه‌گر آن را محاسبه نمی‌کند.
//   'verified'   ⇒ متن رسمی بررسی و تأیید شده؛ فقط در این حالت عدد و تاریخ‌ها باید پر باشند.
//
// «candidate» فقط یادداشت ردیابی منبع ثانویه است و هیچ‌جا در محاسبه استفاده نمی‌شود.

// گزارش احراز: هر تلاش برای رسیدن به متن رسمی و نتیجهٔ آن. نتیجهٔ «بازنشر» هرگز به‌تنهایی تأیید نیست.
export const VERIFICATION_LOG = [
  {
    date: '2026-10-28',
    target: 'جدول ۱۶ قانون بودجه ۱۴۰۵ و تعرفه هزینهٔ دادرسی',
    outcome: 'نرخ‌های ادعایی فقط در منابع ثانویه (وبلاگ‌ها و خبرگزاری‌های حقوقی) دیده شد؛ متن رسمی بودجه و جدول ۱۶ باز نشد. نحوهٔ اعمال نرخ ۲٫۵٪/۳٫۵٪ مشخص نیست.',
  },
  {
    date: '2026-10-28',
    target: 'آیین‌نامه تعرفه حق‌الوکاله، ماده ۹ و مواد ۱۳ تا ۲۴',
    outcome: 'تاریخ تصویب ۱۳۹۸/۱۲/۲۸ در چند عنوان صفحه دیده شد، اما متن مواد و جدول درصدها از هیچ منبع قابل‌دسترسی خوانده نشد. روش اعمال طبقات ماده ۹ احراز نشده است.',
  },
];

export const RATES_BY_YEAR = {
  1405: [
    {
      id: 'court-fee-financial-first',
      title: 'هزینه دادرسی — دعاوی مالی، مرحلهٔ بدوی',
      group: 'court',
      status: 'unverified',
      legal: { citation: 'جدول شمارهٔ ۱۶ قانون بودجه سال ۱۴۰۵ کل کشور', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'tiered',
      mode: null,
      tiers: null,
      min: null,
      max: null,
      candidate: {
        note: 'نرخ ادعایی: ۲٫۵٪ تا ۲۰۰ میلیون ریال و ۳٫۵٪ بالاتر. نحوهٔ اعمال (کل مبلغ یا پله‌ای) و حد کف/سقف احراز نشده.',
      },
    },
    {
      id: 'court-fee-financial-appeal',
      title: 'هزینه دادرسی — دعاوی مالی، تجدیدنظر و واخواهی',
      group: 'court',
      status: 'unverified',
      legal: { citation: 'جدول شمارهٔ ۱۶ قانون بودجه سال ۱۴۰۵ کل کشور', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'tiered',
      mode: null,
      tiers: null,
      min: null,
      max: null,
      candidate: { note: 'نرخ ادعایی: ۴٫۵٪ محکوم‌به. مبنای محاسبه (محکوم‌به یا خواسته) احراز نشده.' },
    },
    {
      id: 'court-fee-financial-cassation',
      title: 'هزینه دادرسی — دعاوی مالی، فرجام‌خواهی',
      group: 'court',
      status: 'unverified',
      legal: { citation: 'جدول شمارهٔ ۱۶ قانون بودجه سال ۱۴۰۵ کل کشور', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'tiered',
      mode: null,
      tiers: null,
      min: null,
      max: null,
      candidate: { note: 'نرخ ادعایی: ۵٫۵٪ محکوم‌به. مبنای محاسبه احراز نشده.' },
    },
    {
      id: 'attorney-tariff-financial',
      title: 'حق‌الوکاله قانونی — دعاوی مالی',
      group: 'attorney',
      status: 'unverified',
      legal: {
        citation: 'آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری (مصوب ۱۳۹۸/۱۲/۲۸)، ماده ۹',
        approvedOn: '1398/12/28',
        effectiveFrom: null,
        sourceUrl: null,
      },
      lastReviewed: '2026-10-28',
      kind: 'tiered',
      mode: null,
      tiers: null,
      min: null,
      max: null,
      candidate: { note: 'ماده ۹ مصوب ۱۳۹۸/۱۲/۲۸ شناسایی شده؛ درصدها و اصلاحات بعدی هنوز از متن رسمی احراز نشده‌اند.' },
    },
    {
      id: 'attorney-tariff-nonfinancial',
      title: 'حق‌الوکاله قانونی — سایر دعاوی و مراحل',
      group: 'attorney',
      status: 'unverified',
      legal: {
        citation: 'آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری (مصوب ۱۳۹۸/۱۲/۲۸)، مواد ۱۳ تا ۲۰',
        approvedOn: '1398/12/28',
        effectiveFrom: null,
        sourceUrl: null,
      },
      lastReviewed: '2026-10-28',
      kind: 'tiered',
      mode: null,
      tiers: null,
      min: null,
      max: null,
      candidate: { note: 'مواد ۱۳ تا ۲۰ ادعا شده؛ هنوز متن و نرخ‌ها احراز نشده‌اند.' },
    },
  ],
};

export function findRule(year, id) {
  return (RATES_BY_YEAR[year] || []).find((r) => r.id === id) || null;
}

export function rulesFor(year, group) {
  return (RATES_BY_YEAR[year] || []).filter((r) => r.group === group);
}
