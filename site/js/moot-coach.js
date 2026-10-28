// پرسش‌گر آموزشی قطعی و آفلاین؛ این ماژول مدل هوش مصنوعی یا نظر حقوقی نیست.
export const COACH_ROLES = Object.freeze({
  judge: {
    label: 'قاضی',
    prompts: [
      'برای اثبات تأخیر ۴۰ روزه، دقیقاً به کدام مدرک یا بند قرارداد تکیه می‌کنید؟',
      'چه واقعیتی نشان می‌دهد اعتصاب حمل‌ونقل در این پرونده عذر موجه است یا نیست؟',
      'مبنای حقوقی و روش اثبات خسارت مورد مطالبهٔ شما چیست؟',
      'اگر شرط خسارت مقطوع وجود ندارد، درخواست نهایی خود را چگونه توجیه می‌کنید؟',
    ],
  },
  opposing: {
    label: 'وکیل طرف مقابل',
    prompts: [
      'موکل من می‌گوید اعتصاب سراسری خارج از کنترل او بوده است؛ پاسخ شما چیست؟',
      'شما هنوز مدرک مشخصی برای رابطهٔ میان تأخیر و خسارت ادعایی ارائه نکرده‌اید؛ چه دارید؟',
      'اعتصاب پیش از امضای قرارداد اعلام شده بود؛ چرا موکل شما این خطر را در قرارداد روشن نکرد؟',
      'اگر بند قرارداد نحوهٔ اعلام حادثه را تعیین کرده، کدام واقعیت رعایت یا نقض آن را ثابت می‌کند؟',
    ],
  },
});

export function getCoachPrompt(role, index) {
  const prompts = COACH_ROLES[role]?.prompts || COACH_ROLES.judge.prompts;
  return prompts[((Math.max(0, Number(index) || 0) % prompts.length) + prompts.length) % prompts.length];
}

export function evaluateOralAnswer(value) {
  const text = String(value || '').trim();
  const checks = [
    { id: 'specific', label: 'به واقعه یا مدرک مشخص اشاره کرده‌اید', test: /قرارداد|بند|مدرک|سند|نامه|تاریخ|۴۰|40|تحویل|اعتصاب/.test(text) },
    { id: 'reasoning', label: 'رابطهٔ دلیل و نتیجه را توضیح داده‌اید', test: /زیرا|بنابراین|در نتیجه|از این رو|چون|موجب|نشان می‌دهد/.test(text) },
    { id: 'request', label: 'درخواست یا نتیجهٔ روشن بیان کرده‌اید', test: /درخواست|تقاضا|محکوم|رد دعوا|پذیرش|خسارت|فسخ/.test(text) },
    { id: 'caveat', label: 'حدود اطلاعات یا نکتهٔ نیازمند اثبات را دیده‌اید', test: /اگر|مشروط|اثبات|احراز|نیازمند|در صورت/.test(text) },
  ];
  const checked = checks.filter((item) => item.test).length;
  return {
    score: Math.round((checked / checks.length) * 100),
    checks: checks.map(({ id, label, test }) => ({ id, label, passed: test })),
    note: text.length < 50
      ? 'پاسخ کوتاه است؛ یک واقعه، دلیل و نتیجه را با جمله‌های روشن اضافه کنید.'
      : 'این بازخورد فقط بر پایهٔ نشانه‌های متنی است و درستی حقوقی پاسخ را تأیید نمی‌کند.',
  };
}
