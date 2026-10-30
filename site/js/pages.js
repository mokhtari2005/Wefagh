// تعریف صفحات. هر صفحه یک تابع رندر دارد که DOM را با API امن می‌سازد (بدون innerHTML با داده).
// status: 'ready' = در فاز ۱ کامل؛ 'planned' = در فازهای بعد با شمارهٔ phase.

export const NAV = [
  { id: 'home', path: '/', title: 'خانه' },
  { id: 'about', path: '/about', title: 'درباره وِفاق' },
  { id: 'academy', path: '/academy', title: 'آکادمی' },
  { id: 'dashboard', path: '/dashboard', title: 'داشبورد من' },
  { id: 'cases', path: '/cases', title: 'بانک پرونده‌ها' },
  { id: 'calculators', path: '/calculators', title: 'محاسبه‌گرها' },
  { id: 'deadlines', path: '/deadlines', title: 'تقویم مواعد' },
  { id: 'media', path: '/media', title: 'رسانه و پادکست' },
  { id: 'laws', path: '/laws', title: 'بانک قوانین', status: 'planned', phase: 6 },
  { id: 'cooperative', path: '/cooperative', title: 'مشارکت صنفی', status: 'planned', phase: 7 },
  { id: 'contact', path: '/contact', title: 'تماس با ما' },
  { id: 'account', path: '/account', title: 'عضویت و حساب' },
];

/** @returns {Array<{text:string, href?:string}>} فهرست ساده برای کارت‌های معرفی */
export const VALUES = [
  { title: 'دفاع از فرهنگ', text: 'حمایت حقوقی از حقوق فرهنگی، آزادی اندیشه و بیان.' },
  { title: 'آموزش عمومی', text: 'انتشار دانش حقوقی به زبانی روشن برای عموم و دانشجویان.' },
  { title: 'عدالت رویه‌ای', text: 'پیگیری شفافیت در قوانین و رویهٔ قضایی.' },
];

// فقط اطلاعاتی که در مخزن و شرح پروژه ثبت شده‌اند؛ هیچ ادعای تأییدنشده‌ای درباره اعضا یا سوابق نیست.
export const ABOUT_SECTIONS = [
  {
    heading: 'وِفاق',
    body: 'وِفاق گروه وکلای مدافع فرهنگ، اندیشه و قانون است.',
  },
  {
    heading: 'فعالیت‌ها',
    body: 'ارائهٔ خدمات حقوقی، آموزش مجازی، رسانه و ابزارهای حرفه‌ای وکالت از جمله تمرین دادرسی، محاسبه‌گرهای حقوقی و بانک پرونده‌های آموزشی.',
  },
  {
    heading: 'تماس',
    body: 'ایمیل رسمی: Vefagh.lawyers@gmail.com',
  },
  {
    heading: 'وضعیت این صفحه',
    body: 'متن معرفی گروه هنوز توسط اعضای گروه تأیید نهایی نشده است و در صورت نیاز به‌روزرسانی می‌شود.',
    draft: true,
  },
];
