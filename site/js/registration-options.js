// فهرست‌ها و برچسب‌های فرم ثبت‌نام. باید با worker/src/auth/profile.js یکی باشد؛ تست tests/registration-profile.test.js این تطابق را بررسی می‌کند.

export const PROVINCES = Object.freeze([
  'آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران',
  'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی', 'خوزستان', 'زنجان',
  'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'کردستان', 'کرمان', 'کرمانشاه',
  'کهگیلویه و بویراحمد', 'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'یزد',
]);

export const PROFESSIONAL_STATUS = Object.freeze({
  trainee: 'کارآموز وکالت',
  lawyer_p1: 'وکیل پایه یک دادگستری',
  law_student: 'دانشجوی حقوق',
  law_graduate: 'دانش‌آموخته حقوق',
  academic: 'عضو هیئت علمی یا مدرس حقوق',
  other: 'سایر علاقه‌مندان به آموزش حقوقی',
});
export const LICENSED_STATUSES = Object.freeze(['trainee', 'lawyer_p1']);

export const EXPERIENCE_BANDS = Object.freeze({
  none: 'بدون سابقهٔ حرفه‌ای',
  under_2: 'کمتر از ۲ سال',
  from_2_to_5: '۲ تا ۵ سال',
  from_5_to_10: '۵ تا ۱۰ سال',
  over_10: 'بیش از ۱۰ سال',
});

export const PRACTICE_AREAS = Object.freeze({
  civil: 'حقوق مدنی',
  contracts: 'قراردادها',
  property: 'دعاوی ملکی',
  criminal: 'حقوق کیفری',
  family: 'خانواده',
  commercial: 'تجارت و شرکت‌ها',
  labor: 'حقوق کار',
  administrative: 'دعاوی اداری',
  procedure: 'آیین دادرسی',
  arbitration: 'داوری و میانجیگری',
});

export const LEARNING_GOALS = Object.freeze({
  licence_exam: 'آمادگی آزمون وکالت',
  daily_practice: 'بهبود کار روزمرهٔ دفتر وکالت',
  advocacy_skills: 'تقویت مهارت دفاع و دادرسی',
  research: 'پژوهش و تحلیل حقوقی',
  teaching: 'تدریس حقوق',
  general_knowledge: 'آشنایی عمومی با حقوق',
});

export const SKILL_AREAS = Object.freeze({
  pleadings: 'تنظیم دادخواست و لایحه',
  contract_drafting: 'نگارش قرارداد',
  case_analysis: 'تحلیل پرونده',
  court_attendance: 'حضور در جلسهٔ دادرسی',
  oral_defense: 'فن دفاع شفاهی',
  negotiation: 'مذاکره',
  client_interview: 'مصاحبه با موکل',
  office_management: 'مدیریت دفتر وکالت',
  professional_ethics: 'اخلاق حرفه‌ای',
});

export const SKILL_LEVELS = Object.freeze({
  beginner: 'مقدماتی',
  intermediate: 'متوسط',
  advanced: 'پیشرفته',
});

export const LEARNING_FORMATS = Object.freeze({
  interactive: 'آموزش تعاملی',
  case_based: 'آموزش پرونده‌محور',
  workshop: 'کارگاه عملی',
  short_lessons: 'درس‌های کوتاه',
  hearing_simulation: 'شبیه‌سازی جلسات دادرسی',
});

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

/** ارقام فارسی/عربی را لاتین می‌کند. */
export function toLatinDigits(value) {
  return String(value).replace(/[۰-۹٠-٩]/g, (d) => {
    const p = PERSIAN.indexOf(d);
    return p >= 0 ? String(p) : String(ARABIC.indexOf(d));
  });
}

/** شمارهٔ موبایل ایرانی به‌صورت 09xxxxxxxxx؛ null اگر نامعتبر است. */
export function normalizePhone(value) {
  const cleaned = toLatinDigits(String(value ?? '').trim()).replace(/[\s\-‌()]/g, '');
  return /^09\d{9}$/.test(cleaned) ? cleaned : null;
}
