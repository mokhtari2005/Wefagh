// تعریف صفحات. هر صفحه یک تابع رندر دارد که DOM را با API امن می‌سازد (بدون innerHTML با داده).
// status: 'ready' = در فاز ۱ کامل؛ 'planned' = در فازهای بعد با شمارهٔ phase.

export const NAV = [
  { id: 'home', path: '/', title: 'خانه' },
  { id: 'about', path: '/about', title: 'درباره وِفاق' },
  { id: 'academy', path: '/academy', title: 'آکادمی', status: 'planned', phase: 3 },
  { id: 'calculators', path: '/calculators', title: 'محاسبه‌گرها', status: 'planned', phase: 2 },
  { id: 'media', path: '/media', title: 'رسانه و پادکست', status: 'planned', phase: 4 },
  { id: 'laws', path: '/laws', title: 'بانک قوانین', status: 'planned', phase: 6 },
  { id: 'cooperative', path: '/cooperative', title: 'مشارکت صنفی', status: 'planned', phase: 7 },
  { id: 'membership', path: '/membership', title: 'عضویت', status: 'planned', phase: 5 },
  { id: 'contact', path: '/contact', title: 'تماس با ما' },
  { id: 'account', path: '/account', title: 'حساب کاربری' },
];

/** @returns {Array<{text:string, href?:string}>} فهرست ساده برای کارت‌های معرفی */
export const VALUES = [
  { title: 'دفاع از فرهنگ', text: 'حمایت حقوقی از حقوق فرهنگی، آزادی اندیشه و بیان.' },
  { title: 'آموزش عمومی', text: 'انتشار دانش حقوقی به زبانی روشن برای عموم و دانشجویان.' },
  { title: 'عدالت رویه‌ای', text: 'پیگیری شفافیت در قوانین و رویهٔ قضایی.' },
];

export const ABOUT_SECTIONS = [
  {
    heading: 'ما که هستیم',
    body: 'گروه وکلای مدافع فرهنگ، اندیشه و قانون «وفاق» مجموعه‌ای از وکلا و پژوهشگران حقوقی است که به دفاع از حقوق فرهنگی و آزادی‌های اندیشه می‌پردازد.',
  },
  {
    heading: 'ماموریت',
    body: 'ارائهٔ مشاورهٔ حقوقی، آموزش عمومی، و تولید محتوای رسانه‌ای و علمی دربارهٔ قانون و عدالت.',
  },
  {
    heading: 'یادداشت',
    body: 'این متن نمونه است و باید پیش از انتشار توسط گروه تأیید و جایگزین شود.',
    draft: true,
  },
];
