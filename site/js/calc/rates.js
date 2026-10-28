// قواعد نرخ هزینه‌ها، به‌تفکیک سال. هر قاعده منبع، تاریخ‌ها، وضعیت احراز و تفسیر جدا دارد.
//
// وضعیت‌ها:
//   'unverified'    ⇒ هنوز متن قابل‌استناد یا مبنای محاسبه مشخص نیست؛ محاسبه نمی‌شود.
//   'text_read'     ⇒ متن خوانده شده؛ تفسیر یا تأیید کاربر ندارد؛ محاسبه نمی‌شود.
//   'user_approved' ⇒ کاربر برای استفاده در ماشین‌حساب تأیید کرده (userApproval). احراز رسمی مستقل نیست؛ موتور اعمال می‌کند.
//   'verified'      ⇒ با روزنامهٔ رسمی یا پایگاه ملی قوانین احراز شده؛ هنوز هیچ قاعده‌ای چنین نیست.
//
// kind: 'tiered' | 'fixed' | 'range' (بازه، مبلغ انتخاب نمی‌شود) | 'share' (سهم از مرحله) | 'discretionary' (تشخیص مرجع)
// «note»، «statusDetail» و «interpretation» فقط ردیابی‌اند.

// فراداده اسناد. userAccepted یعنی کاربر برای ادامهٔ کار پذیرفته؛ این به‌معنای احراز رسمی نیست.
export const SOURCE_DOCUMENTS = [
  {
    id: 'attorney-regulation-scan-1399',
    title: 'آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری (اسکن با سربرگ و امضا، شمارهٔ ۹۰۰۰/۱۴۷۲/۱۰۰ تاریخ ۱۳۹۹/۱/۹ ؛ نامهٔ ارجاع شمارهٔ ۹۰۰۰/۱۶۴۸/۱۰۰ تاریخ ۱۳۹۹/۰۱/۰۹)',
    origin: 'اسکن ارائه‌شده توسط کاربر (فایل 011936f5)؛ سربرگ قوهٔ قضاییه، نامهٔ معاونت تدوین و امضای مدیرکل دبیرخانه',
    observedSourceUrl: 'ندارد (اسکن فایل)',
    pagesRead: '۱ تا ۸ از ۸ (کامل)',
    userAccepted: true,
    independentlyVerifiedOfficialSource: false,
    note: 'اسکن از روی سند اصالت فیزیکی/دیجیتال را نشان نمی‌دهد؛ روزنامهٔ رسمی دیده نشده است. متن ماده‌ها با بازنشر اختبار مطابق بررسی شد.',
  },
  {
    id: 'attorney-regulation-republication',
    title: 'آیین‌نامه تعرفه حق‌الوکاله ۱۳۹۸ (بازنشر اختبار)',
    origin: 'بازنشر در پایگاه اختبار (پاورقی PDF: www.ekhtebar.ir)',
    observedSourceUrl: 'پاورقی PDF: www.ekhtebar.ir (نشانی کامل ثبت نشده)',
    pagesRead: '۱ تا ۱۵ از ۱۹',
    userAccepted: true,
    independentlyVerifiedOfficialSource: false,
  },
  {
    id: 'judicial-fees-republication-1405',
    title: 'تعرفه خدمات قضایی و هزینه دادرسی ۱۴۰۵ (بازنشر اختبار)',
    origin: 'بازنشر در پایگاه اختبار',
    observedSourceUrl: 'نشانی کامل ثبت نشده',
    pagesRead: '۱ تا ۳ از ۷',
    userAccepted: true,
    independentlyVerifiedOfficialSource: false,
  },
  {
    id: 'budget-bill-1405',
    title: 'لایحه بودجه سال ۱۴۰۵ کل کشور (سازمان برنامه و بودجه)',
    origin: 'لایحه، نه قانون تصویب‌شده',
    observedSourceUrl: 'فایل پیوست؛ نشانی منبع ثبت نشده',
    pagesRead: '۱ تا ۸، ۲۵۸ تا ۲۹۱ از ۳۱۹',
    userAccepted: true,
    independentlyVerifiedOfficialSource: false,
  },
];

const USER_APPROVAL = {
  by: 'user',
  date: '2026-10-28',
  scope: 'calculator-use',
  officialVerified: false,
};

// وضعیت‌های جدا: متن، تفسیر، اصالت رسمی، و مجوز فعال‌سازی
const ART9_DETAIL = {
  textObserved: 'متن در بازنشر اختبار و اسکن کاربر (۱۳۹۹/۱/۹) مطابق بررسی شد',
  interpretation: 'عبارت «نسبت به مازاد» تفسیر پله‌ای است (بررسی متن)',
  officialAuthentication: 'احراز رسمی نشده؛ روزنامهٔ رسمی دیده نشده',
  activationBasis: 'تأیید کاربر برای استفاده در ماشین‌حساب',
};
const COURT_DETAIL = {
  textObserved: 'لایحه ۱۴۰۵ و بازنشر جدول ۱۶ مشاهده شده‌اند',
  interpretation: 'تفسیر پله‌ای و مبنای «ارزش خواسته» توسط کاربر تعیین شده؛ تفسیر کل‌مبلغ رد شده است',
  officialAuthentication: 'احراز رسمی نشده (تصویب مجلس و روزنامهٔ رسمی دیده نشده)',
  activationBasis: 'تأیید کاربر برای استفاده در ماشین‌حساب',
};

export const VERIFICATION_LOG = [
  {
    date: '2026-10-28',
    target: 'آیین‌نامه حق‌الوکاله ۱۳۹۸ — اسکن کاربر (011936f5)',
    outcome: 'اسکن کامل ۸ صفحه خوانده شد. سربرگ قوهٔ قضاییه و نامهٔ ارجاع با امضا دیده شد. متن مواد ۹، ۱۲، ۱۴، ۲۱، ۲۴، ۲۵ با بازنشر مطابق است. اصالت فیزیکی یا رسمی از روی اسکن قابل احراز نیست؛ روزنامهٔ رسمی دیده نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'تفسیر و واحد توسط کاربر',
    outcome: 'کاربر تعیین کرد: مبنای تجدیدنظر و فرجام «ارزش خواسته» است؛ هزینه بدوی تا ۲۰۰ میلیون ۲٫۵٪ و مازاد ۳٫۵٪ (پله‌ای)؛ واحد اقلام ثابت «ریال». این تصمیم کاربر است و به‌عنوان احراز رسمی ثبت نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'پذیرش اسناد توسط کاربر',
    outcome: 'کاربر اسناد را برای ادامهٔ کار پذیرفته است (userAccepted). independentlyVerifiedOfficialSource = false برای همه.',
  },
  {
    date: '2026-10-28',
    target: 'لایحه بودجه ۱۴۰۵ و بازنشر جدول ۱۶',
    outcome: 'بخش دادگستری جدول ۱۶ (صفحات چاپی ۲۸۸ تا ۲۹۱) با بازنشر تطابق متنی دارد. سرستون لایحه «یکصد ریال» است، پس مبلغ‌های ۱۵٬۰۰۰ و ۳٬۰۰۰ در لایحه با ضرب در ۱۰۰ همان ۱٬۵۰۰٬۰۰۰ و ۳۰۰٬۰۰۰ ریال بازنشر می‌شوند. تصویب مجلس و روزنامهٔ رسمی ثبت نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'تلاش‌های ناموفق: ekhtebar.ir (robots)، rrk.ir، dotic.ir، rooznamehrasmi.ir، rc.majlis.ir، edalatsara.com (robots)، websitevakil.ir، iranvekalat.ir، danesh.dadrah.ir',
    outcome: 'دسترسی ممکن نشد. روزنامهٔ رسمی و نظریه‌های مشورتی خوانده نشدند.',
  },
];

export const RATES_BY_YEAR = {
  1405: [
    // ---------- هزینه دادرسی (جدول ۱۶) ----------
    {
      id: 'court-fee-financial-first',
      title: 'هزینه دادرسی — دعاوی مالی، مرحلهٔ بدوی',
      group: 'court',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      statusDetail: COURT_DETAIL,
      legal: { citation: 'جدول ۱۶ ۱۴۰۵ — هزینه دادرسی موضوع بند (۱۲) ماده (۳) قانون وصول برخی درآمدهای دولت (لایحه و بازنشر)', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته',
      kind: 'tiered',
      mode: 'incremental',
      tiers: [
        { upTo: 200000000, percent: 2.5 },
        { upTo: null, percent: 3.5 },
      ],
      interpretation: {
        note: 'تفسیر پله‌ای: ۲٫۵٪ تا ۲۰۰ میلیون و ۳٫۵٪ بر مازاد. تفسیر کل‌مبلغ (۳٫۵٪ بر کل) به تصمیم کاربر رد شده است.',
        readings: ['incremental'],
      },
    },
    {
      id: 'court-fee-financial-appeal',
      title: 'هزینه دادرسی — دعاوی مالی، تجدیدنظر',
      group: 'court',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      legal: { citation: 'جدول ۱۶ ۱۴۰۵ — مرحلهٔ تجدیدنظر', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 4.5 }],
      note: 'مبنا «ارزش خواسته» (تصمیم کاربر و متن جدول). «محکوم‌به» که قبلاً گفته شده بود، کنار گذاشته شد.',
    },
    {
      id: 'court-fee-financial-cassation',
      title: 'هزینه دادرسی — دعاوی مالی، فرجام‌خواهی',
      group: 'court',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      legal: { citation: 'جدول ۱۶ ۱۴۰۵ — مرحلهٔ فرجام‌خواهی', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 5.5 }],
      note: 'مبنا همانند تجدیدنظر.',
    },
    {
      id: 'court-fee-unknown-value',
      title: 'هزینه دادرسی — دعوای مالی با بهای خواستهٔ نامشخص',
      group: 'court',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      legal: { citation: 'جدول ۱۶ ۱۴۰۵', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 1500000,
      unit: 'ریال',
    },
    {
      id: 'court-fee-interim-enforcement',
      title: 'هزینه اجرای موقت احکام (کلیه مراجع)',
      group: 'court',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      legal: { citation: 'جدول ۱۶ ۱۴۰۵', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 300000,
      unit: 'ریال',
    },
    {
      id: 'court-fee-interlocutory-objection',
      title: 'هزینهٔ اعتراض و تجدیدنظر از قرارهای قابل تجدیدنظر',
      group: 'court',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      legal: { citation: 'جدول ۱۶ ۱۴۰۵', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 300000,
      unit: 'ریال',
    },
    {
      id: 'court-fee-non-financial',
      title: 'هزینه دادرسی — دعاوی غیرمالی و تأمین دلیل/خواسته',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ ۱۴۰۵ — «طبق بخشنامه رئیس قوه قضاییه»', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 400000,
      max: 1800000,
      note: 'بازه‌ای است؛ مبلغ دقیق بدون بخشنامهٔ معتبر انتخاب نمی‌شود.',
    },

    // ---------- حق‌الوکاله (آیین‌نامه ۱۳۹۸/۱۲/۲۸) ----------
    {
      id: 'attorney-article9-financial-nonfinal',
      title: 'حق‌الوکاله — دعوای مالی، حکم غیرقطعی (ماده ۹ بند الف تا ث)',
      group: 'attorney',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      statusDetail: ART9_DETAIL,
      legal: { citation: 'آیین‌نامه تعرفه حق‌الوکاله، ماده ۹', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
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
      note: 'متن: الف تا ۵۰۰ م ۸٪؛ ب نسبت به مازاد تا ۲ میلیارد ۷٪؛ پ نسبت به مازاد تا ۱۰ میلیارد ۵٪؛ ت نسبت به مازاد تا ۳۰ میلیارد ۴٪؛ ث از ۳۰ میلیارد به بالا ۳٪.',
    },
    {
      id: 'attorney-article9-financial-final',
      title: 'حق‌الوکاله — دعوای مالی، حکم قطعی از حیث بهای خواسته (ماده ۹ — ۱۰٪)',
      group: 'attorney',
      status: 'user_approved',
      userApproval: USER_APPROVAL,
      statusDetail: ART9_DETAIL,
      legal: { citation: 'آیین‌نامه تعرفه حق‌الوکاله، ماده ۹ (حکم قطعی از حیث بهای خواسته)', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'بهای خواسته',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 10 }],
      note: 'جدا از بندهای غیرقطعی نگهداری می‌شود. تبصرهٔ ماده ۶۲ (بهای نامشخص) در این قاعده لحاظ نشده است.',
    },
    {
      id: 'attorney-article12-termination',
      title: 'حق‌الوکاله — ختم دعوا پیش/پس از پاسخ و سقوط تجدیدنظر (ماده ۱۲)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۱۲', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'share',
      items: [
        { label: 'ابطال دادخواست پیش از پاسخ به دعوا', share: 0.25, stage: 'first' },
        { label: 'رد دادخواست پس از پاسخ به دعوا', share: 0.5, stage: 'first' },
        { label: 'عدم استماع یا رد دعوا به علل مانند مرور زمان، اعتبار امر مختوم، رد تقاضای اعاده دادرسی', share: 1, stage: 'first' },
        { label: 'سقوط تجدیدنظرخواهی پیش از پاسخ', share: 0.25, stage: 'appeal' },
        { label: 'سقوط تجدیدنظرخواهی پس از پاسخ', share: 0.5, stage: 'appeal' },
      ],
      note: 'سهم‌ها نسبت به حق‌الوکالهٔ همان مرحله‌اند؛ مبلغ مرحله ورودی است و موتور محاسبه نمی‌کند.',
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
      note: 'بازهٔ قانونی؛ مبلغ دقیق توافقی یا با تصمیم مرجع است.',
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
      id: 'attorney-article14-criminal-a',
      title: 'حق‌الوکاله — دعاوی کیفری، صلاحیت دادگاه کیفری یک / نظامی یک / انقلاب (ماده ۱۴ بند الف)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۱۴ بند الف', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 10000000,
      max: 2000000000,
      classes: [
        { label: 'سلب حیات، قطع عضو، حبس ابد یا تعزیری درجه ۱', min: 50000000, max: 2000000000 },
        { label: 'تعزیری درجه ۲ و ۳', min: 30000000, max: 1000000000 },
        { label: 'سایر جرایم', min: 10000000, max: 500000000 },
      ],
      note: 'طبقه‌بندی جرم با مرجع تصمیم است. تبصرهٔ ۱ (۵۰/۳۰/۲۰) و تبصرهٔ ۳ (۲۰٪ به‌ازای هر جرم اضافه) محاسبه نشده‌اند.',
    },
    {
      id: 'attorney-article14-criminal-b',
      title: 'حق‌الوکاله — دعاوی کیفری، صلاحیت کیفری دو / نظامی دو / اطفال و نوجوانان (ماده ۱۴ بند ب)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۱۴ بند ب', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 2000000,
      max: 500000000,
      classes: [
        { label: 'حدود، دیات و تعزیری درجه ۴ و ۵', min: 10000000, max: 500000000 },
        { label: 'تعزیری درجه ۶', min: 5000000, max: 300000000 },
        { label: 'سایر جرایم', min: 2000000, max: 200000000 },
      ],
      note: 'طبقه‌بندی جرم با مرجع تصمیم است؛ تبصرهٔ ۱ ماده ۱۴ عمومی است.',
    },
    {
      id: 'attorney-article21-stage-split',
      title: 'حق‌الوکاله — تقسیم ۶۰٪ نخستین / ۴۰٪ تجدیدنظر (ماده ۲۱)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۲۱ (موضوع مواد ۹، ۱۳ و ۲۰)', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'share',
      shares: [
        { stage: 'first', share: 0.6 },
        { stage: 'appeal', share: 0.4 },
      ],
      note: 'مبلغ کل از قاعدهٔ دیگری می‌آید؛ این قاعده محاسبه نمی‌شود.',
    },
    {
      id: 'attorney-article24-withdrawal',
      title: 'حق‌الوکاله — عزل، فوت، حجر یا استعفای وکیل (ماده ۲۴)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۲۴', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'discretionary',
      note: 'پرونده آمادهٔ رأی: تمام حق‌الوکالهٔ آن مرحله. در غیر این صورت به تناسب کار انجام‌شده و به تشخیص کانون یا مرکز.',
    },
    {
      id: 'attorney-article25-enforcement-judgment',
      title: 'حق‌الوکاله — امور اجرایی حقوقی: اجرای احکام دادگستری و اجرای اسناد رسمی (ماده ۲۵، سقف ۲٪)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۲۵', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 4000000,
      max: null,
      maxPercent: 2,
      percentBase: 'مبلغ محکوم‌به یا مورد اجرا',
      note: 'متن: حداقل ۴ م و حداکثر ۲٪ محکوم‌به. این قاعده هنوز بازه است و محاسبه نمی‌شود.',
    },
    {
      id: 'attorney-article25-enforcement',
      title: 'حق‌الوکاله — سایر امور اجرایی (ماده ۲۵)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۲۵', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 4000000,
      max: 150000000,
      note: 'متن: نسبت به دیگر موارد حداقل ۴ م و حداکثر ۱۵۰ م.',
    },
  ],
};

export function findRule(year, id) {
  return (RATES_BY_YEAR[year] || []).find((r) => r.id === id) || null;
}

export function rulesFor(year, group) {
  return (RATES_BY_YEAR[year] || []).filter((r) => r.group === group);
}
