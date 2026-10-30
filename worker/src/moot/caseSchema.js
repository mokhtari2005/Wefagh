// اعتبارسنجی ساختار پروندهٔ موت‌کورت. هر پرونده باید همهٔ بخش‌های لازم را داشته باشد
// و پیش از انتشار (status = published) تمام استنادهای قانونی تأییدشده باشند.

export const AREAS = Object.freeze([
  'حقوق مدنی و قراردادها',
  'معاملات املاک، مالکیت و تصرف',
  'مسئولیت مدنی و مطالبه خسارت',
  'خانواده، مهریه، نفقه، طلاق و حضانت',
  'ارث، وصیت و امور حسبی',
  'شرکت‌ها، تجارت و اختلافات شرکا',
  'اسناد تجاری، چک و سفته',
  'حقوق کار و تأمین اجتماعی',
  'دعاوی بانکی و تعهدات مالی',
  'حقوق کیفری و جرایم علیه اشخاص و اموال',
  'جرایم اقتصادی و مالی',
  'آیین دادرسی مدنی و کیفری',
  'دعاوی ثبتی و اجرای احکام',
  'حقوق عمومی و دعاوی اداری',
  'مالکیت فکری و حقوق فناوری',
  'قراردادهای پیمانکاری و اختلافات تجاری',
  'حقوق شرکت‌ها و ورشکستگی',
  'دعاوی بیمه و خسارات',
  'اختلافات مربوط به وکالت و مسئولیت حرفه‌ای',
  'سایر موضوعات کاربردی و میان‌رشته‌ای حقوقی',
]);

export const DIFFICULTIES = Object.freeze(['basic', 'medium', 'advanced']);
export const STATUSES = Object.freeze(['draft', 'review', 'published', 'retired']);


// وضعیت‌های استناد: تأییدشده، نیازمند بررسی، اصلاح‌شده.
export const REF_STATUSES = Object.freeze(['verified', 'needs_review', 'corrected']);
const PUBLISHABLE_REF = Object.freeze(['verified', 'corrected']);

/**
 * استناد تأییدشده باید شماره ماده و منبع بررسی داشته باشد؛ اصلاح‌شده باید یادداشت اصلاح داشته باشد.
 * نیازمند بررسی فقط نام قانون و موضوع لازم دارد (شماره ماده تا تأیید متن نباید ثبت شود).
 */
export function validRef(r) {
  if (!r || typeof r !== 'object') return false;
  if (!text(r.law, 3, 160) || !text(r.topic, 3, 300)) return false;
  if (!REF_STATUSES.includes(r.status)) return false;
  const hasArticle = r.article === null || r.article === undefined || text(r.article, 1, 40);
  if (!hasArticle) return false;
  if (r.status === 'verified') return text(r.article, 1, 40) && text(r.source, 3, 300);
  if (r.status === 'corrected') return text(r.article, 1, 40) && text(r.source, 3, 300) && text(r.note, 5, 600);
  return r.article === null || r.article === undefined || text(r.article, 1, 40);
}

const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const list = (v, min, itemCheck) => Array.isArray(v) && v.length >= min && v.every(itemCheck);

/**
 * @returns {{ok: true} | {ok: false, errors: string[]}}
 * status = published یعنی همهٔ استنادها verified باشند.
 */
export function validateCase(c, { status = c?.status || 'draft' } = {}) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  if (!c || typeof c !== 'object') return { ok: false, errors: ['پرونده خالی است.'] };

  need(text(c.id, 3, 64) && /^[a-z0-9-]+$/.test(c.id), 'شناسهٔ پرونده باید فقط حروف کوچک لاتین، عدد و خط تیره باشد.');
  need(text(c.title, 2, 160), 'عنوان پرونده لازم است.');
  need(AREAS.includes(c.area), 'حوزهٔ حقوقی معتبر نیست.');
  need(DIFFICULTIES.includes(c.difficulty), 'سطح دشواری باید basic، medium یا advanced باشد.');
  need(text(c.subject, 5, 300), 'موضوع دعوا لازم است.');
  need(c.parties && text(c.parties.plaintiff, 3, 200) && text(c.parties.defendant, 3, 200), 'مشخصات خواهان و خوانده لازم است.');
  need(c.request && text(c.request.claim, 3, 300), 'خواسته لازم است.');
  need(list(c.facts, 3, (f) => text(f, 10, 1000)), 'شرح وقایع: حداقل ۳ بند متنی.');
  need(list(c.documents, 1, (d) => d && text(d.title, 3, 160) && text(d.summary, 10, 600)), 'مستندات: حداقل یک سند با عنوان و خلاصه.');
  need(list(c.issues, 2, (i) => text(i, 5, 300)), 'مسائل حقوقی: حداقل ۲ مورد.');
  need(c.claims && text(c.claims.plaintiff, 10, 1000) && text(c.claims.defendant, 10, 1000), 'ادعا و دفاع اولیهٔ هر طرف لازم است.');
  need(list(c.legal_refs, 1, (r) => validRef(r)), 'مستندات حقوقی: حداقل یک استناد با قانون، موضوع و وضعیت معتبر.');
  need(list(c.judge_questions, 3, (q) => text(q, 5, 300)), 'پرسش‌های قاضی: حداقل ۳ مورد.');
  need(c.strengths_weaknesses && ['plaintiff', 'defendant'].every((k) => {
    const s = c.strengths_weaknesses[k];
    return s && list(s.strengths, 1, (x) => text(x, 5, 300)) && list(s.weaknesses, 1, (x) => text(x, 5, 300));
  }), 'نقاط قوت و ضعف هر طرف لازم است.');
  need(list(c.defense_scenarios, 2, (d) => d && text(d.trigger, 5, 300) && text(d.response, 10, 600)), 'سناریوهای دفاع و پاسخ متقابل: حداقل ۲ مورد.');
  need(c.verdict && text(c.verdict.outcome, 10, 600) && text(c.verdict.reasoning, 30, 2000), 'رأی آموزشی پیشنهادی با استدلال لازم است.');
  need(list(c.evaluation_focus, 3, (x) => text(x, 5, 200)), 'چارچوب ارزیابی: حداقل ۳ محور ارزیابی مرتبط با پرونده.');

  if (status === 'published') {
    const open = (c.legal_refs || []).filter((r) => r && !PUBLISHABLE_REF.includes(r.status));
    need(open.length === 0, `پرونده منتشرشده نمی‌تواند استناد بررسی‌نشده داشته باشد (${open.length} مورد).`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}
