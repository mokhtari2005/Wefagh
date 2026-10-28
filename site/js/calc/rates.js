// قواعد نرخ هزینه‌ها، به‌تفکیک سال. هر قاعده منبع، تاریخ‌ها و وضعیت احراز دارد.
//
// وضعیت‌ها:
//   'unverified' ⇒ هنوز متن قابل‌استناد نخوانده شده یا مبنای محاسبه مشخص نیست؛ محاسبه نمی‌شود.
//   'text_read'  ⇒ متن بازنشرشده خوانده شده (نه روزنامهٔ رسمی)؛ هنوز با منبع رسمی تطبیق نشده؛ محاسبه نمی‌شود.
//   'verified'   ⇒ با روزنامهٔ رسمی یا پایگاه ملی قوانین تطبیق شده؛ فقط در این حالت موتور آن را اعمال می‌کند.
//
// kind: 'tiered' (پلکانی) | 'fixed' (مبلغ ثابت) | 'range' (بازهٔ حداقل–حداکثر، انتخاب مبلغ با مرجع تصمیم است) | 'share' (سهم از مرحله/مبلغ دیگر)
// «candidate» و «note» فقط ردیابی‌اند و هیچ‌جا در محاسبه استفاده نمی‌شوند.

// گزارش احراز: هر تلاش و نتیجه. نتیجهٔ «بازنشر» تأیید رسمی نیست.
export const VERIFICATION_LOG = [
  {
    date: '2026-10-28',
    target: 'آیین‌نامه تعرفه حق‌الوکاله، مواد ۱ تا ۳۴',
    outcome: 'متن کامل بازنشرشده در یک خبرگزاری حقوقی (اختبار) خوانده شد: ۳۴ ماده و ۱۰ تبصره، تاریخ تصویب ۱۳۹۸/۱۲/۲۸ توسط رئیس قوه قضاییه. مطابقت با روزنامهٔ رسمی یا پایگاه ملی قوانین انجام نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'جدول تعرفه خدمات قضایی و هزینه دادرسی ۱۴۰۵ (جدول ۱۶ قانون بودجه)',
    outcome: 'جدول بازنشرشده در اختبار خوانده شد. قانون بودجه ۱۴۰۵ در ۱۴۰۴/۱۱/۲۸ تصویب و در روزنامهٔ رسمی ۱۴۰۴/۱۲/۲۸ منتشر شده است (به گزارش همان منبع). مطابقت با روزنامهٔ رسمی انجام نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'کیت‌ست: هزینه دادرسی و حق‌الوکاله و تمبر',
    outcome: 'هزینه دادرسی: بدون عدد. حق‌الوکاله: طبقات متفاوت با مستند ۱۳۸۵/۴/۲۷. استفاده نشد؛ فقط برای تطبیق.',
  },
  {
    date: '2026-10-28',
    target: 'تلاش‌های ناموفق: ekhtebar.ir (robots)، dotic.ir، rooznamehrasmi.ir، rc.majlis.ir، websitevakil.ir، iranvekalat.ir، danesh.dadrah.ir',
    outcome: 'دسترسی ممکن نشد. متن رسمی از این منابع خوانده نشد.',
  },
];

export const RATES_BY_YEAR = {
  1405: [
    // ---------- هزینه دادرسی (جدول ۱۶) ----------
    {
      id: 'court-fee-financial-first',
      title: 'هزینه دادرسی — دعاوی مالی، مرحلهٔ بدوی',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵ — ردیف هزینه دادرسی موضوع بند (۱۲) ماده (۳) قانون وصول برخی درآمدهای دولت', approvedOn: '1404/11/28', effectiveFrom: '1404/12/28 + ۱۵ روز (ماده ۲ قانون مدنی)', sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته',
      kind: 'tiered',
      mode: null,
      tiers: null,
      interpretation: {
        note: 'متن جدول: «تا مبلغ ۲۰۰ میلیون ریال: ۲٫۵٪ ارزش خواسته» و «بیش از ۲۰۰ میلیون ریال: ۳٫۵٪ ارزش خواسته». تفسیر ۱: نرخ کل‌مبلغ (اگر ارزش بیش از ۲۰۰ میلیون باشد، ۳٫۵٪ بر کل). تفسیر ۲: پله‌ای (۲٫۵٪ بر ۲۰۰ میلیون و ۳٫۵٪ بر مازاد). متن جدول صراحت ندارد؛ انتخاب بدون مستند فعال نمی‌شود.',
        readings: ['whole', 'incremental'],
      },
    },
    {
      id: 'court-fee-financial-appeal',
      title: 'هزینه دادرسی — دعاوی مالی، تجدیدنظر',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵ — مرحلهٔ تجدیدنظر', approvedOn: '1404/11/28', effectiveFrom: '1404/12/28 + ۱۵ روز', sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته (طبق متن جدول)',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 4.5 }],
      note: 'کاربر مبنای «محکوم‌به» گفته بود؛ متن جدول «ارزش خواسته» نوشته است. این اختلاف باید با روزنامهٔ رسمی بررسی شود.',
    },
    {
      id: 'court-fee-financial-cassation',
      title: 'هزینه دادرسی — دعاوی مالی، فرجام‌خواهی',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵ — مرحلهٔ فرجام‌خواهی', approvedOn: '1404/11/28', effectiveFrom: '1404/12/28 + ۱۵ روز', sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته (طبق متن جدول)',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 5.5 }],
      note: 'مبنا همانند تجدیدنظر؛ اختلاف با «محکوم‌به» باید بررسی شود.',
    },
    {
      id: 'court-fee-unknown-value',
      title: 'هزینه دادرسی — دعوای مالی با بهای خواستهٔ نامشخص',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵', approvedOn: '1404/11/28', effectiveFrom: '1404/12/28 + ۱۵ روز', sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 1500000,
    },
    {
      id: 'court-fee-interim-enforcement',
      title: 'هزینه اجرای موقت احکام (کلیه مراجع)',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵', approvedOn: '1404/11/28', effectiveFrom: '1404/12/28 + ۱۵ روز', sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 300000,
    },
    {
      id: 'court-fee-interlocutory-objection',
      title: 'هزینهٔ اعتراض و تجدیدنظر از قرارهای قابل تجدیدنظر',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵', approvedOn: '1404/11/28', effectiveFrom: '1404/12/28 + ۱۵ روز', sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 300000,
    },
    {
      id: 'court-fee-non-financial',
      title: 'هزینه دادرسی — دعاوی غیرمالی و تأمین دلیل/خواسته',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ قانون بودجه ۱۴۰۵ — «طبق بخشنامه رئیس قوه قضاییه»', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 400000,
      max: 1800000,
      note: 'بازه‌ای است که متن نوع دعوا را تعیین نمی‌کند؛ مبلغ دقیق بدون بخشنامهٔ معتبر انتخاب نمی‌شود. بخشنامه باید احراز شود.',
    },

    // ---------- حق‌الوکاله (آیین‌نامه ۱۳۹۸/۱۲/۲۸) ----------
    {
      id: 'attorney-article9-financial-nonfinal',
      title: 'حق‌الوکاله — دعوای مالی، حکم غیرقطعی (ماده ۹ بند الف تا ث)',
      group: 'attorney',
      status: 'text_read',
      legal: {
        citation: 'آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری، ماده ۹',
        approvedOn: '1398/12/28',
        effectiveFrom: null,
        sourceUrl: null,
      },
      lastReviewed: '2026-10-28',
      base: 'بهای خواسته',
      kind: 'tiered',
      mode: 'incremental',
      tiers: [
        { upTo: 500000000, percent: 8 },
        { upTo: 2000000000, percent: 7 },
        { upTo: 10000000000, percent: 5 },
        { upTo: 30000000000, percent: 4 },
        { upTo: null, percent: 3 },
      ],
      note: 'متن: «تا ۵۰۰ میلیون ۸٪؛ نسبت به مازاد تا ۲ میلیارد ۷٪؛ مازاد تا ۱۰ میلیارد ۵٪؛ مازاد تا ۳۰ میلیارد ۴٪؛ از ۳۰ میلیارد به بالا ۳٪». عبارت «نسبت به مازاد» نشان می‌دهد پله‌ای است؛ هنوز با روزنامهٔ رسمی تطبیق نشده.',
    },
    {
      id: 'attorney-article9-financial-final',
      title: 'حق‌الوکاله — دعوای مالی، حکم قطعی از حیث بهای خواسته (ماده ۹)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه تعرفه حق‌الوکاله، ماده ۹ (با لحاظ ماده ۶۲ آیین دادرسی مدنی)', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'بهای خواسته',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 10 }],
    },
    {
      id: 'attorney-article13-family',
      title: 'حق‌الوکاله — امور حسبی و دعاوی خانوادگی و مالی ناشی از زوجیت (ماده ۱۳ بند الف)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۱۳ بند الف', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 5000000,
      max: 200000000,
      note: 'بازهٔ قانونی؛ مبلغ دقیق در داخل بازه توافقی یا تصمیم مرجع است و این ابزار انتخاب نمی‌کند.',
    },
    {
      id: 'attorney-article13-nonfinancial',
      title: 'حق‌الوکاله — دعاوی غیرمالی (ماده ۱۳ بند ب)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۱۳ بند ب', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 4000000,
      max: 300000000,
      note: 'بازهٔ قانونی؛ انتخاب مبلغ دقیق انجام نمی‌شود.',
    },
    {
      id: 'attorney-article25-enforcement',
      title: 'حق‌الوکاله — امور اجرایی (ماده ۲۵)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۲۵', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 4000000,
      max: 150000000,
      note: 'برای اجرای حقوقی سقف دو درصد مبلغ محکوم‌به نیز دارد؛ آن شرط با متن تطبیق نشده است.',
    },
  ],
};

export function findRule(year, id) {
  return (RATES_BY_YEAR[year] || []).find((r) => r.id === id) || null;
}

export function rulesFor(year, group) {
  return (RATES_BY_YEAR[year] || []).filter((r) => r.group === group);
}
