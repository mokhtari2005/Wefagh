// پروفایل ثبت‌نام: فهرست‌های مجاز و اعتبارسنجی سمت سرور.
// نسخهٔ سمت کاربر در site/js/registration-options.js است و تست tests/registration-profile.test.js تطابق آن‌ها را بررسی می‌کند.
import { cleanText, cleanMultiline } from '../validate.js';

export const PROVINCES = Object.freeze([
  'آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران',
  'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی', 'خوزستان', 'زنجان',
  'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'کردستان', 'کرمان', 'کرمانشاه',
  'کهگیلویه و بویراحمد', 'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'یزد',
]);

export const PROFESSIONAL_STATUSES = Object.freeze(['trainee', 'lawyer_p1', 'law_student', 'law_graduate', 'academic', 'other']);
// وضعیت‌هایی که اطلاعات کانون/پروانه برایشان مرتبط است.
export const LICENSED_STATUSES = Object.freeze(['trainee', 'lawyer_p1']);
export const EXPERIENCE_BANDS = Object.freeze(['none', 'under_2', 'from_2_to_5', 'from_5_to_10', 'over_10']);
export const PRACTICE_AREAS = Object.freeze([
  'civil', 'contracts', 'property', 'criminal', 'family', 'commercial', 'labor',
  'administrative', 'procedure', 'arbitration',
]);
export const LEARNING_GOALS = Object.freeze(['licence_exam', 'daily_practice', 'advocacy_skills', 'research', 'teaching', 'general_knowledge']);
export const SKILL_AREAS = Object.freeze([
  'pleadings', 'contract_drafting', 'case_analysis', 'court_attendance', 'oral_defense',
  'negotiation', 'client_interview', 'office_management', 'professional_ethics',
]);
export const SKILL_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced']);
export const LEARNING_FORMATS = Object.freeze(['interactive', 'case_based', 'workshop', 'short_lessons', 'hearing_simulation']);

const PHONE_RE = /^09\d{9}$/;
const LICENSE_RE = /^[0-9A-Za-z؀-ۿ\-\/ ]+$/;
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** ارقام فارسی و عربی را به لاتین تبدیل می‌کند. */
export function toLatinDigits(value) {
  return String(value).replace(/[۰-۹٠-٩]/g, (d) => {
    const p = PERSIAN_DIGITS.indexOf(d);
    return p >= 0 ? String(p) : String(ARABIC_DIGITS.indexOf(d));
  });
}

/** شماره موبایل ایرانی به صورت 09xxxxxxxxx؛ null اگر نامعتبر است. */
export function normalizePhone(value) {
  const cleaned = toLatinDigits(cleanText(value)).replace(/[\s\-‌()]/g, '');
  return PHONE_RE.test(cleaned) ? cleaned : null;
}

function oneOf(value, list) {
  return typeof value === 'string' && list.includes(value);
}

function manyOf(value, list, { min = 0, max = list.length } = {}) {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value)];
  if (unique.length < min || unique.length > max) return null;
  if (!unique.every((v) => typeof v === 'string' && list.includes(v))) return null;
  return unique;
}

/**
 * اعتبارسنجی پروفایل ثبت‌نام.
 * @returns {{ok:true, value:object} | {ok:false, errors:Record<string,string>}}
 */
export function validateProfile(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const value = {};

  value.phone = normalizePhone(src.phone);
  if (!value.phone) errors.phone = 'شمارهٔ موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.';

  value.province = cleanText(src.province);
  if (!oneOf(value.province, PROVINCES)) errors.province = 'استان را از فهرست انتخاب کنید.';

  value.city = cleanText(src.city);
  if (value.city.length < 2 || value.city.length > 60) errors.city = 'نام شهر باید بین ۲ و ۶۰ نویسه باشد.';

  value.professionalStatus = oneOf(src.professionalStatus, PROFESSIONAL_STATUSES) ? src.professionalStatus : null;
  if (!value.professionalStatus) errors.professionalStatus = 'وضعیت حرفه‌ای خود را انتخاب کنید.';

  const licensed = LICENSED_STATUSES.includes(value.professionalStatus);
  if (licensed) {
    value.barAssociation = cleanText(src.barAssociation);
    if (value.barAssociation.length < 2 || value.barAssociation.length > 120) {
      errors.barAssociation = 'نام کانون یا مرجع صادرکنندهٔ پروانه را وارد کنید.';
    }
    const license = cleanText(toLatinDigits(src.licenseNumber ?? ''));
    if (license) {
      if (license.length > 30 || !LICENSE_RE.test(license)) errors.licenseNumber = 'شماره پروانه معتبر نیست.';
      else value.licenseNumber = license;
    } else {
      value.licenseNumber = null;
    }
    const yearRaw = src.licenseYear;
    if (yearRaw === '' || yearRaw === undefined || yearRaw === null) {
      value.licenseYear = null;
    } else {
      const year = Number(toLatinDigits(yearRaw));
      if (!Number.isInteger(year) || year < 1340 || year > 1420) errors.licenseYear = 'سال معتبر نیست.';
      else value.licenseYear = year;
    }
  } else {
    value.barAssociation = null;
    value.licenseNumber = null;
    value.licenseYear = null;
  }

  value.experienceBand = oneOf(src.experienceBand, EXPERIENCE_BANDS) ? src.experienceBand : null;
  if (!value.experienceBand) errors.experienceBand = 'میزان سابقه را انتخاب کنید.';

  value.practiceAreas = manyOf(src.practiceAreas, PRACTICE_AREAS, { min: 1, max: PRACTICE_AREAS.length });
  if (!value.practiceAreas) errors.practiceAreas = 'حداقل یک حوزهٔ فعالیت یا علاقه انتخاب کنید.';

  value.learningGoal = oneOf(src.learningGoal, LEARNING_GOALS) ? src.learningGoal : null;
  if (!value.learningGoal) errors.learningGoal = 'هدف اصلی خود را انتخاب کنید.';

  value.skillAreas = manyOf(src.skillAreas, SKILL_AREAS, { min: 1, max: SKILL_AREAS.length });
  if (!value.skillAreas) errors.skillAreas = 'حداقل یک مهارت برای تقویت انتخاب کنید.';

  value.skillLevel = oneOf(src.skillLevel, SKILL_LEVELS) ? src.skillLevel : null;
  if (!value.skillLevel) errors.skillLevel = 'سطح فعلی مهارت را انتخاب کنید.';

  value.learningFormat = oneOf(src.learningFormat, LEARNING_FORMATS) ? src.learningFormat : null;
  if (!value.learningFormat) errors.learningFormat = 'روش آموزشی ترجیحی را انتخاب کنید.';

  const notes = cleanMultiline(src.notes ?? '');
  if (notes.length > 500) errors.notes = 'توضیحات نباید بیش از ۵۰۰ نویسه باشد.';
  value.notes = notes || null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}
