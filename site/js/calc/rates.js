// قواعد نرخ هزینه‌ها، به‌تفکیک سال. هر قاعده منبع، تاریخ‌ها و وضعیت احراز دارد.
//
// وضعیت‌ها:
//   'unverified' ⇒ هنوز متن قابل‌استناد نخوانده شده یا مبنای محاسبه مشخص نیست؛ محاسبه نمی‌شود.
//   'text_read'  ⇒ متن خوانده شده (بازنشر یا لایحه)؛ هنوز با روزنامهٔ رسمی/قانون لازم‌الاجرا تطبیق نشده؛ محاسبه نمی‌شود.
//   'verified'   ⇒ با روزنامهٔ رسمی یا پایگاه ملی قوانین تطبیق شده؛ فقط در این حالت موتور آن را اعمال می‌کند.
//
// kind:
//   'tiered'        پلکانی (tiers + mode)؛ موتور محاسبه می‌کند اگر verified باشد
//   'fixed'         مبلغ ثابت؛ موتور محاسبه می‌کند اگر verified باشد
//   'range'         بازهٔ حداقل–حداکثر؛ انتخاب مبلغ با مرجع تصمیم است؛ محاسبه نمی‌شود
//   'share'         سهم از مبلغ/مرحلهٔ دیگر (نیازمند ورودی مرحله)؛ محاسبه نمی‌شود
//   'discretionary' تشخیص کانون یا مرجع؛ محاسبه نمی‌شود
// «candidateTiers»، «candidate» و «note» فقط ردیابی‌اند و هیچ‌جا در محاسبه استفاده نمی‌شوند.

// گزارش احراز: هر تلاش و نتیجه. نتیجهٔ «بازنشر» یا «لایحه» تأیید رسمی نیست.
export const VERIFICATION_LOG = [
  {
    date: '2026-10-28',
    target: 'آیین‌نامه تعرفه حق‌الوکاله، مواد ۱ تا ۳۴ (فایل پیوست fd69f537)',
    outcome: 'متن بازنشرشدهٔ اختبار (صفحات ۱ تا ۱۵ از ۱۹ خوانده شد). مواد ۹، ۱۲، ۱۳، ۱۴، ۲۱، ۲۴، ۲۵ و تبصره‌های مرتبط در متن دیده شد. مطابقت با روزنامهٔ رسمی یا پایگاه ملی قوانین انجام نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'جدول ۱۶ ۱۴۰۵ — بازنشر اختبار (فایل پیوست c2bcc731)',
    outcome: 'بازنشر اختبار (۷ صفحه؛ صفحات ۱ تا ۳ خوانده شد). ردیف‌های ۲٫۵٪ / ۳٫۵٪ / ۴٫۵٪ / ۵٫۵٪ و اقلام ثابت در آن دیده شد. مطابقت با روزنامهٔ رسمی انجام نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'لایحه بودجه ۱۴۰۵ کل کشور، سازمان برنامه و بودجه، ۳۱۹ صفحه (فایل پیوست 3454ce79)',
    outcome: 'این یک «لایحه» است، نه قانون تصویب‌شده. بخش دادگستری جدول ۱۶ (کد ۱۴۰۱۰۱، صفحات چاپی ۲۸۸ تا ۲۹۱) خوانده شد. ردیف‌های هزینه دادرسی موضوع بند (۱۲) ماده (۳) با ۲٫۵٪ تا ۲۰۰ میلیون ریال، ۳٫۵٪ بیش از ۲۰۰ میلیون ریال، ۴٫۵٪ تجدیدنظر، ۵٫۵٪ فرجام‌خواهی؛ مبنای همه «ارزش خواسته» است. ردیف‌های اقلام ثابت (اجرای موقت، اعتراض، بهای نامشخص) نیز دیده شد. تصویب مجلس، اصلاحات احتمالی و روزنامهٔ رسمی ثبت نشده است؛ مطابقت انجام نشده است.',
  },
  {
    date: '2026-10-28',
    target: 'اصالت اسناد (آیین‌نامه حق‌الوکاله، جدول ۱۶ ۱۴۰۵)',
    outcome: 'کاربر اعلام کرد اصالت اسناد مورد تأیید اوست. این تأیید از سوی کاربر است؛ خود این ابزار روزنامهٔ رسمی را ندیده و شماره/تاریخ/نشانی منبع رسمی ثبت نشده است. وضعیت قواعد هنوز text_read است و تا ارائهٔ منبع رسمی و تصمیم دربارهٔ تفسیر جدول ۱۶ (کل‌مبلغ/پله‌ای و مبنای ارزش خواسته/محکوم‌به) فعال نمی‌شود.',
  },
  {
    date: '2026-10-28',
    target: 'کیت‌ست: هزینه دادرسی و حق‌الوکاله و تمبر',
    outcome: 'هزینه دادرسی: بدون عدد. حق‌الوکاله: طبقات متفاوت با مستند ۱۳۸۵/۴/۲۷ که با متن ۱۳۹۸ تناقض دارد. استفاده نشد؛ فقط برای تطبیق.',
  },
  {
    date: '2026-10-28',
    target: 'تلاش‌های ناموفق: ekhtebar.ir (robots)، rrk.ir، dotic.ir، rooznamehrasmi.ir، rc.majlis.ir، websitevakil.ir، iranvekalat.ir، danesh.dadrah.ir',
    outcome: 'دسترسی ممکن نشد. متن روزنامهٔ رسمی یا پایگاه ملی قوانین خوانده نشد.',
  },
];

export const RATES_BY_YEAR = {
  1405: [
    // ---------- هزینه دادرسی (جدول ۱۶ — متن بودجه و بازنشر) ----------
    {
      id: 'court-fee-financial-first',
      title: 'هزینه دادرسی — دعاوی مالی، مرحلهٔ بدوی',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵ — هزینه دادرسی موضوع بند (۱۲) ماده (۳) قانون وصول برخی درآمدهای دولت', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته',
      kind: 'tiered',
      mode: null,
      tiers: null,
      candidateTiers: [
        { upTo: 200000000, percent: 2.5 },
        { upTo: null, percent: 3.5 },
      ],
      interpretation: {
        note: 'متن: «تا ۲۰۰ میلیون ریال: ۲٫۵٪ ارزش خواسته» و «بیش از ۲۰۰ میلیون ریال: ۳٫۵٪ ارزش خواسته». تفسیر ۱ (کل مبلغ): ۳٫۵٪ بر کل ارزش خواسته. تفسیر ۲ (پله‌ای): ۲٫۵٪ بر ۲۰۰ میلیون و ۳٫۵٪ بر مازاد. متن صراحت ندارد که عبارت «بیش از» به‌صورت مازاد محاسبه شود؛ تا تصمیم مرجع معتبر یا متن قانون لازم‌الاجرا، فعال نمی‌شود.',
        readings: ['whole', 'incremental'],
      },
      note: 'مبنای «ارزش خواسته» است؛ کاربر «محکوم‌به» گفته بود. هر دو متن موجود (لایحه و بازنشر) «ارزش خواسته» می‌گویند؛ قانون لازم‌الاجرا هنوز بررسی نشده است.',
    },
    {
      id: 'court-fee-financial-appeal',
      title: 'هزینه دادرسی — دعاوی مالی، تجدیدنظر',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵ — مرحلهٔ تجدیدنظر', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته (طبق متن لایحه و بازنشر)',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 4.5 }],
      note: 'نرخ ثابت ۴٫۵٪ بدون پله؛ مبنا «ارزش خواسته» است، نه «محکوم‌به» که کاربر گفته بود.',
    },
    {
      id: 'court-fee-financial-cassation',
      title: 'هزینه دادرسی — دعاوی مالی، فرجام‌خواهی',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵ — مرحلهٔ فرجام‌خواهی', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      base: 'ارزش خواسته (طبق متن لایحه و بازنشر)',
      kind: 'tiered',
      mode: 'whole',
      tiers: [{ upTo: null, percent: 5.5 }],
      note: 'نرخ ثابت ۵٫۵٪؛ مبنا همانند تجدیدنظر.',
    },
    {
      id: 'court-fee-unknown-value',
      title: 'هزینه دادرسی — دعوای مالی با بهای خواستهٔ نامشخص',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 1500000,
      note: 'لایحه مبلغ «۱۵٬۰۰۰» را با سرستون «یکصد ریال» (در لایحه) و «قران» (در ستون نرخ) نشان می‌دهد؛ واحد با بازنشر (۱٬۵۰۰٬۰۰۰ ریال) یکی نیست. تا روشن نشود فعال نمی‌شود.',
    },
    {
      id: 'court-fee-interim-enforcement',
      title: 'هزینه اجرای موقت احکام (کلیه مراجع)',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 300000,
      note: 'واحد همانند ردیف بهای نامشخص بررسی نشده است.',
    },
    {
      id: 'court-fee-interlocutory-objection',
      title: 'هزینهٔ اعتراض و تجدیدنظر از قرارهای قابل تجدیدنظر',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'fixed',
      fixedAmount: 300000,
      note: 'واحد همانند ردیف بهای نامشخص بررسی نشده است.',
    },
    {
      id: 'court-fee-non-financial',
      title: 'هزینه دادرسی — دعاوی غیرمالی و تأمین دلیل/خواسته',
      group: 'court',
      status: 'text_read',
      legal: { citation: 'جدول ۱۶ لایحه/بازنشر ۱۴۰۵ — «طبق بخشنامه رئیس قوه قضاییه»', approvedOn: null, effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'range',
      min: 400000,
      max: 1800000,
      note: 'بازه‌ای است که متن نوع دعوا را تعیین نمی‌کند؛ مبلغ دقیق بدون بخشنامهٔ معتبر انتخاب نمی‌شود.',
    },

    // ---------- حق‌الوکاله (آیین‌نامه ۱۳۹۸/۱۲/۲۸، متن بازنشرشده) ----------
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
      note: 'متن ماده ۹: «الف- تا ۵۰۰ میلیون ریال: ۸٪؛ ب- نسبت به مازاد بر ۵۰۰ میلیون تا ۲ میلیارد: ۷٪؛ پ- نسبت به مازاد بر ۲ میلیارد تا ۱۰ میلیارد: ۵٪؛ ت- نسبت به مازاد بر ۱۰ میلیارد تا ۳۰ میلیارد: ۴٪؛ ث- از مبلغ ۳۰ میلیارد به بالا: ۳٪». عبارت «نسبت به مازاد» پلکانی بودن را نشان می‌دهد. با روزنامهٔ رسمی تطبیق نشده است.',
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
      note: 'نرخ ۱۰٪ جدا از بندهای غیرقطعی نگهداری می‌شود و با آن ادغام نمی‌شود. تبصرهٔ ماده ۶۲ (صفحهٔ ۶ فایل) مربوط به بهای خواستهٔ نامشخص است و در این قاعده لحاظ نشده است.',
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
      note: 'سهم‌ها نسبت به حق‌الوکالهٔ همان مرحله است؛ بنابراین به ورودی مبلغ مرحله نیاز دارد و موتور آن را محاسبه نمی‌کند. «حق‌الوکاله مرحله» بر اساس ماده ۹ یا ۱۳ کدام است، تصمیم‌گیری جدا لازم دارد.',
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
      note: 'طبقه‌بندی جرم با مرجع تصمیم است؛ این ابزار طبقه را تعیین نمی‌کند. تبصرهٔ ۱ ماده ۱۴: ۵۰٪ مربوط به تحقیق در دادسرا، ۳۰٪ دادگاه بدوی، ۲۰٪ تجدیدنظر. تبصرهٔ ۳ (ماده ۱۴): به ازای هر جرم اضافه‌تر ۲۰٪ به حق‌الوکاله افزوده می‌شود. این موارد محاسبه نشده‌اند.',
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
      note: 'طبقه‌بندی جرم با مرجع تصمیم است. تبصرهٔ ۱ ماده ۱۴ (تقسیم ۵۰/۳۰/۲۰) عمومی است و متن آن برای این بند نیز صادق است.',
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
      note: 'این تقسیم برای مبلغ کل حق‌الوکاله مواد ۹ و ۱۳ و ۲۰ است. محاسبه نمی‌شود، چون مبلغ کل از قاعدهٔ دیگری می‌آید.',
    },
    {
      id: 'attorney-article24-withdrawal',
      title: 'حق‌الوکاله — عزل، فوت، حجر یا استعفای وکیل (ماده ۲۴)',
      group: 'attorney',
      status: 'text_read',
      legal: { citation: 'آیین‌نامه ۱۳۹۸، ماده ۲۴', approvedOn: '1398/12/28', effectiveFrom: null, sourceUrl: null },
      lastReviewed: '2026-10-28',
      kind: 'discretionary',
      note: 'اگر پرونده آمادهٔ صدور رأی باشد: تمام حق‌الوکالهٔ آن مرحله. در غیر این صورت: به تناسب کار انجام‌شده، به تشخیص کانون یا مرکز تعیین می‌شود. تشخیص نیاز به ورودی انسانی دارد.',
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
      note: 'متن: «حداقل چهار میلیون ریال و حداکثر دو درصد مبلغ محکوم‌به یا مورد اجرا». سقف ۱۵۰ میلیون در متن این بند ذکر نشده است.',
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
      note: 'متن: «نسبت به دیگر موارد حداقل چهار میلیون ریال و حداکثر تا مبلغ یکصد و پنجاه میلیون ریال». مبنای سقف دو درصد جدا است.',
    },
  ],
};

export function findRule(year, id) {
  return (RATES_BY_YEAR[year] || []).find((r) => r.id === id) || null;
}

export function rulesFor(year, group) {
  return (RATES_BY_YEAR[year] || []).filter((r) => r.group === group);
}
