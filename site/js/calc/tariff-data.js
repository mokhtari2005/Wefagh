// فهرست ساختاریافتهٔ آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری (مصوب ۱۳۹۸/۱۲/۲۸).
// مبنا: فایل fd69f537 (۱۹ صفحه). هر ماده و تبصره یک‌بار ثبت شده و شمارهٔ صفحهٔ آن در فایل آمده است.
//
// وضعیت هر ماده:
//   calculated ⇒ مبلغ یا سهم یا سقفی از این ماده در محاسبه‌گر اعمال شده؛ ruleIds قواعد آن را نشان می‌دهد.
//   range      ⇒ متن بازهٔ مبلغ تعیین می‌کند؛ مبلغ قطعی تولید نمی‌شود و فقط در فهرست بازه‌ها نمایش داده می‌شود.
//   reference  ⇒ حکم رویه‌ای یا تفسیری است و مبلغ عددی ندارد؛ یا متن آن در محاسبه‌گر نیست.
//   excluded   ⇒ اجرا به داده‌ای نیاز دارد که در فایل نیست، یا متن مبهم است؛ محاسبه نمی‌شود.

export const ATTORNEY_TARIFF = {
  id: 'attorney-tariff-fd69f537',
  title: 'آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری',
  approvedOn: '1398/12/28',
  approvedBy: 'رئیس قوه قضاییه',
  dateInText: '۱۱ فروردین ۱۳۹۹ (مندرج در متن)',
  sourceFile: 'fd69f537 — ۱۹ صفحه؛ چاپ صفحه‌ای از بازنشر اختبار',
  articleCount: 34,
  noteCount: 10,
  indexation: 'متن هیچ شاخص یا تعدیل سالانه‌ای ندارد؛ مبالغ همان مبالغ مصوب‌اند.',
  repeal: 'با تصویب این آیین‌نامه، کلیه آیین‌نامه‌های سابق حق‌الوکاله، حق‌المشاوره و هزینه سفر ملغی است.',
  officialVerified: false,
};

// هر ماده: no، page (صفحهٔ شروع در فایل)، title، status، ruleIds، note (توضیح کوتاه)
export const ATTORNEY_ARTICLES = [
  { no: 1, page: 1, title: 'اصطلاحات (کانون، مرکز، صندوق، قانون مالیات‌ها)', status: 'reference', ruleIds: [] },
  { no: 2, page: 2, title: 'قرارداد حق‌الوکاله؛ در نبود قرارداد، تعرفه ملاک است؛ قرارداد کمتر از تعرفه، در مورد محکوم‌علیه ملاک', status: 'reference', ruleIds: [] },
  { no: 3, page: 2, title: 'وکالتنامه باید مبلغ را درج کند و «طبق تعرفه» ننویسد؛ غیرنقدی، معادل ریالی', status: 'reference', ruleIds: [] },
  { no: 4, page: 3, title: 'کسری تمبر مالیاتی؛ اخطار به وکیل و اخطاریه‌ها به موکل', status: 'reference', ruleIds: [] },
  { no: 5, page: 3, title: 'وکلای متعدد بدون قرارداد: تقسیم مساوی', status: 'calculated', ruleIds: ['attorney-article5-equal-split'] },
  { no: 6, page: 4, title: 'وکیل جدید: ابطال تمبر و پرداخت سهم‌ها (با تبصره)', status: 'reference', ruleIds: [] },
  { no: 7, page: 4, title: 'وکالت تبرعی برای اقربای نسبی یا سببی تا درجه ۳ از طبقه ۳: معاف از تمبر و سهم‌ها', status: 'reference', ruleIds: [] },
  { no: 8, page: 5, title: 'وکیل تسخیری یا معاضدتی: دو برابر «حداقل تعرفه»', status: 'excluded', ruleIds: [], note: 'متن «حداقل تعرفه» را به قاعدهٔ مشخصی نسبت نمی‌دهد؛ تا تعیین مبنا محاسبه نمی‌شود.' },
  { no: 9, page: 5, title: 'دعاوی مالی: غیرقطعی (۸٪، ۷٪، ۵٪، ۴٪، ۳٪ پلکانی) و قطعی (۱۰٪)', status: 'calculated', ruleIds: ['attorney-article9-financial-nonfinal', 'attorney-article9-financial-final'] },
  { no: 10, page: 6, title: 'طرح یا دفاع در برابر ورود ثالث، جلب، اعتراض ثالث و تقابل: معادل حق‌الوکالهٔ همان مرحله', status: 'reference', ruleIds: [] },
  { no: 11, page: 7, title: 'حکم غیابی و اعتراض به آن: میزان ماده ۹؛ در واخواهی حق‌الوکالهٔ دیگری تعلق نمی‌گیرد', status: 'reference', ruleIds: [] },
  { no: 12, page: 7, title: 'ابطال دادخواست، رد دادخواست، عدم استماع، سقوط تجدیدنظر: سهم‌ها و اعتراض به قرارها', status: 'calculated', ruleIds: [
    'attorney-article12-dismissal-before-answer', 'attorney-article12-dismissal-after-answer', 'attorney-article12-dismissal-other-grounds',
    'attorney-article12-appeal-dismissal-before-answer', 'attorney-article12-appeal-dismissal-after-answer', 'attorney-article12-interlocutory-objection',
  ] },
  { no: 13, page: 8, title: 'امور حسبی و خانوادگی (۵ تا ۲۰۰ م) و غیرمالی (۴ تا ۳۰۰ م)', status: 'range', ruleIds: ['attorney-article13-family', 'attorney-article13-nonfinancial'] },
  { no: 14, page: 8, title: 'دعاوی کیفری: بندهای الف تا ث و طبقات جرم؛ تبصرهٔ ۱ تفکیک ۵۰/۳۰/۲۰؛ تبصرهٔ ۳ افزایش ۲۰٪', status: 'calculated', ruleIds: [
    'attorney-article14-criminal-a', 'attorney-article14-criminal-b', 'attorney-article14-criminal-objection', 'attorney-article14-criminal-cassation',
    'attorney-article14-criminal-special', 'attorney-article14-stage-investigation', 'attorney-article14-stage-trial',
    'attorney-article14-stage-appeal', 'attorney-article14-stage-trial-without-prosecution', 'attorney-article14-multiple-charges',
  ], note: 'بندهای الف و ب فقط بازهٔ طبقات را دارند و مبلغ قطعی نمی‌دهند.' },
  { no: 15, page: 11, title: 'اعتراض به آرای شوراهای حل اختلاف: حق‌الوکالهٔ مرحلهٔ مربوط', status: 'reference', ruleIds: [] },
  { no: 16, page: 11, title: 'دیوان عالی کشور در دعاوی مالی و غیرمالی: تعرفه مرحلهٔ تجدیدنظر', status: 'reference', ruleIds: [] },
  { no: 17, page: 11, title: 'اعتراض کیفری در دیوان عالی کشور: تعرفه مرحلهٔ تجدیدنظر', status: 'reference', ruleIds: [] },
  { no: 18, page: 11, title: 'وکیل پس از نقض رأی: یک‌دوم حق‌الوکالهٔ پیش از نقض', status: 'calculated', ruleIds: ['attorney-article18-after-reversal'] },
  { no: 19, page: 12, title: 'دادسرا و دادگاه عالی انتظامی قضات: حداکثر ۲۰ میلیون', status: 'calculated', ruleIds: ['attorney-article19-prosecution-cap'], note: 'حداقل ذکر نشده است.' },
  { no: 20, page: 12, title: 'دیوان عدالت اداری و تعزیرات (۴ تا ۵۰۰ م)؛ مراجع غیرقضایی مانند هیئت‌های قانون کار (۴ تا ۲۰۰ م)', status: 'range', ruleIds: ['attorney-article20-administrative', 'attorney-article20-non-judicial'] },
  { no: 21, page: 12, title: 'تقسیم ۶۰٪ مرحلهٔ نخستین و ۴۰٪ تجدیدنظر (مواد ۹، ۱۳ و ۲۰)', status: 'calculated', ruleIds: ['attorney-article21-first-stage', 'attorney-article21-appeal-stage'] },
  { no: 22, page: 12, title: 'پرداخت در ابتدای هر مرحله؛ تبصره: ۱۰٪ افزایش برای گواهی تخصصی', status: 'calculated', ruleIds: ['attorney-article22-specialty'], note: 'پرداخت در ابتدای مرحله، مگر توافق دیگر، متن‌محور است و محاسبه نمی‌شود.' },
  { no: 23, page: 13, title: 'صلح و سازش یا داوری: حق‌الوکالهٔ کل دعوا', status: 'reference', ruleIds: [] },
  { no: 24, page: 13, title: 'عزل، فوت، حجر یا استعفای وکیل: تمام حق‌الوکاله یا تشخیص کانون یا مرکز', status: 'reference', ruleIds: ['attorney-article24-withdrawal'], note: 'تشخیصی است و مبلغ قطعی ندارد.' },
  { no: 25, page: 13, title: 'امور اجرایی: احکام و اسناد رسمی (حداقل ۴ م، حداکثر ۲٪)؛ سایر موارد (۴ تا ۱۵۰ م)', status: 'range', ruleIds: ['attorney-article25-enforcement-judgment', 'attorney-article25-enforcement'], note: 'کف ۴ م و سقف ۲٪ در متن با هم متعارض‌اند؛ محاسبه نمی‌شود.' },
  { no: 26, page: 14, title: 'بدون وکالتنامه و توافق: تنظیم لایحه (حداکثر ۵۰ م)؛ مشاوره به ازای ساعت (۰٫۵ تا ۵ م)؛ مطالعهٔ پرونده (۲ تا ۵۰ م)', status: 'calculated', ruleIds: ['attorney-article26-drafting-cap', 'attorney-article26-consultation-hourly', 'attorney-article26-file-study'] },
  { no: 27, page: 15, title: 'تعرفه دادسرا و دادگاه ویژهٔ روحانیت: تابع این آیین‌نامه', status: 'reference', ruleIds: [] },
  { no: 28, page: 15, title: 'موارد تعیین‌تکلیف‌نشده: ۱۰ تا ۲۵۰ م', status: 'range', ruleIds: ['attorney-article28-other'] },
  { no: 29, page: 15, title: 'سهم کانون، مرکز و صندوق از تمبر و حق‌الوکاله', status: 'excluded', ruleIds: [], note: 'مبنای تمبر مالیاتی (ماده ۱۰۳ قانون مالیات‌ها) در فایل نیست.' },
  { no: 30, page: 15, title: 'هزینهٔ سفر به عهدهٔ موکل؛ فوق‌العاده مأموریت ۱٬۵۰۰٬۰۰۰ ریال (داخل استان) و ۳٬۰۰۰٬۰۰۰ ریال (خارج استان) به‌ازای هر روز', status: 'calculated', ruleIds: ['attorney-article30-travel-in-province', 'attorney-article30-travel-out-of-province'], note: 'سفر خارج از کشور «هم‌طراز مدیران کل» است و مبلغ عددی ندارد.' },
  { no: 31, page: 16, title: 'گواهی ابطال تمبر مازاد', status: 'excluded', ruleIds: [], note: 'به مبلغ تمبر ابطال‌شده نیاز دارد که در فایل نیست.' },
  { no: 32, page: 17, title: 'توقف پرونده به دلیل فوت یا حجر موکل: قبول وکالت از وراث بدون تمبر مجدد', status: 'reference', ruleIds: [] },
  { no: 33, page: 17, title: 'موکل دولتی: بدون ابطال تمبر؛ پرداخت سهم کانون، مرکز و صندوق با فیش', status: 'reference', ruleIds: [] },
  { no: 34, page: 17, title: 'درآمد سالیانه وکلا برای مالیات: بیست برابر تمبر ابطال‌شده', status: 'excluded', ruleIds: [], note: 'به مبلغ تمبر ابطال‌شده نیاز دارد که در فایل نیست.' },
];

// تبصره‌ها (ده تبصره در متن). article: ماده‌ای که تبصره به آن تعلق دارد.
export const ATTORNEY_NOTES = [
  { article: 5, page: 4, label: 'تبصره ماده ۵ — وکلای مختلف با پروانه‌های کانون و مرکز', status: 'reference' },
  { article: 6, page: 4, label: 'تبصره ماده ۶ — وکیل جدید پس از ابطال تمبر', status: 'reference' },
  { article: 9, page: 6, label: 'تبصره ماده ۹ — بهای خواسته در زمان دادخواست نامشخص', status: 'reference', note: 'تعدیل تمبر پس از تعیین بهای قطعی؛ در محاسبه‌گر لحاظ نشده است.' },
  { article: 12, page: 8, label: 'تبصره ماده ۱۲ — فسخ یا نقض قرار و اعادهٔ پرونده', status: 'reference', note: 'حق‌الوکالهٔ آن مرحله به وکیل تعلق می‌گیرد.' },
  { article: 14, page: 10, label: 'تبصره ۱ ماده ۱۴ — تفکیک ۵۰٪ دادسرا، ۳۰٪ بدوی، ۲۰٪ تجدیدنظر', status: 'calculated', ruleIds: [
    'attorney-article14-stage-investigation', 'attorney-article14-stage-trial', 'attorney-article14-stage-appeal', 'attorney-article14-stage-trial-without-prosecution',
  ] },
  { article: 14, page: 10, label: 'تبصره ۲ ماده ۱۴ — فرجام با اعادهٔ دادرسی و نقض رأی', status: 'reference', note: 'حق‌الوکالهٔ آن مرحله اضافه می‌شود؛ مبلغ عددی ندارد.' },
  { article: 14, page: 10, label: 'تبصره ۳ ماده ۱۴ — چند جرم در پرونده؛ ۲۰٪ به‌ازای هر جرم اضافه', status: 'calculated', ruleIds: ['attorney-article14-multiple-charges'] },
  { article: 22, page: 12, label: 'تبصره ماده ۲۲ — گواهی وکالت تخصصی؛ ۱۰٪', status: 'calculated', ruleIds: ['attorney-article22-specialty'] },
  { article: 26, page: 14, label: 'تبصره ماده ۲۶ — اعلام درآمد و پرداخت تمبر هر اردیبهشت', status: 'reference' },
  { article: 30, page: 16, label: 'تبصره ماده ۳۰ — وکیل خارج از محل پروانه: حق سفر ندارد', status: 'reference' },
];

/** شمارش وضعیت‌ها؛ برای آزمون پوشش و نمایش خلاصه. */
export function coverageSummary() {
  const counts = { calculated: 0, range: 0, reference: 0, excluded: 0 };
  for (const a of ATTORNEY_ARTICLES) counts[a.status] += 1;
  return counts;
}
