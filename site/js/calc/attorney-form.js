// محاسبهٔ حق‌الوکاله بر اساس فرم مرجع (موضوع، نوع دعوا، نتیجهٔ ختم دعوا، گواهی تخصصی، مأموریت، نقض رأی، تسخیری).
// خالص و بدون DOM. هر عدد فقط از قاعدهٔ تأییدشدهٔ rates.js و موتور applyRule می‌آید؛ قاعدهٔ ناقص حدس زده نمی‌شود.
//
// نکات حقوقی که در متن تعرفه (فایل fd69f537) مستقیماً بررسی شده‌اند:
// - ماده ۱۲: سهم ختم دعوا از «حق‌الوکالهٔ مرحلهٔ نخستین» است؛ برای دعوای مالی این مبنا با ماده ۹ (بند الف تا ث) از بهای خواسته محاسبه می‌شود.
// - ماده ۱۸: سهم وکیلی که پس از نقض می‌پذیرد، یک‌دوم حق‌الوکالهٔ پیش از نقض است؛ مبنای آن در این ابزار همان حق‌الوکالهٔ حکم است.
// - ماده ۲۲ (تبصره): ۱۰٪ افزایش فقط در حدود صلاحیت تخصصی؛ این ابزار حدود صلاحیت را بررسی نمی‌کند.
// - ماده ۳۰: فوق‌العادهٔ مأموریت روزانه؛ هزینهٔ سفر و اقامت جداگانه است و در این ابزار محاسبه نمی‌شود.
// - ماده ۸: حق‌الوکالهٔ تسخیری/معاضدتی «دو برابر حداقل تعرفه» است، اما حداقل تعرفه در فایل تعریف نشده؛ پس محاسبه انجام نمی‌شود.
// - تمبر مالیاتی و سهم کانون/مرکز/صندوق: مبنای آن در فایل تعرفه نیست؛ محاسبه نمی‌شود.
// - ماده ۱۳ و ۱۴ و ۲۸: بازه‌ای هستند؛ عدد قطعی نمی‌دهند و فقط بازه نمایش داده می‌شود.

import { findRule } from './rates.js';
import { applyRule } from './engine.js';

export const ATTORNEY_RATE_YEAR = 1405;

export const RULE = Object.freeze({
  f9Nonfinal: 'attorney-article9-financial-nonfinal',
  f9Final: 'attorney-article9-financial-final',
  dismissBefore: 'attorney-article12-dismissal-before-answer',
  dismissAfter: 'attorney-article12-dismissal-after-answer',
  dismissOther: 'attorney-article12-dismissal-other-grounds',
  appealBefore: 'attorney-article12-appeal-dismissal-before-answer',
  appealAfter: 'attorney-article12-appeal-dismissal-after-answer',
  interlocutory: 'attorney-article12-interlocutory-objection',
  family: 'attorney-article13-family',
  nonfinancial: 'attorney-article13-nonfinancial',
  reversal: 'attorney-article18-after-reversal',
  specialty: 'attorney-article22-specialty',
  travelIn: 'attorney-article30-travel-in-province',
  travelOut: 'attorney-article30-travel-out-of-province',
  other: 'attorney-article28-other',
  criminal: ['attorney-article14-criminal-a', 'attorney-article14-criminal-b', 'attorney-article14-criminal-objection', 'attorney-article14-criminal-cassation', 'attorney-article14-criminal-special'],
});

/** نتیجه‌های ختم دعوا با سهم ماده ۱۲؛ مقدار «unsupported» در متن تعرفه معادل ندارد و قابل انتخاب نیست. */
export const RESULT_RULE_BY_VALUE = Object.freeze({
  dismissBefore: RULE.dismissBefore,
  dismissAfter: RULE.dismissAfter,
  dismissOther: RULE.dismissOther,
  appealBefore: RULE.appealBefore,
  appealAfter: RULE.appealAfter,
});

function rule(id) {
  return findRule(ATTORNEY_RATE_YEAR, id);
}

function run(id, input) {
  const r = rule(id);
  if (!r) return { ok: false, error: 'RULE_MISSING' };
  return applyRule(r, input);
}

function fail(error, message, extra = {}) {
  return { ok: false, error, message, ...extra };
}

function rangeOf(id, title) {
  const r = rule(id);
  if (!r || typeof r.min !== 'number' || typeof r.max !== 'number') return null;
  return { title, min: r.min, max: r.max, legal: r.legal?.citation || '' };
}

/**
 * @param {object} input
 * @param {'attorney'|'tax-kanon'|'tax-markaz'} input.subject
 * @param {'financial'|'family'|'criminal'|'other'} input.caseType
 * @param {'nonfinal'|'final'|''} input.judgment  برای دعوای مالی و بدون ختم دعوا الزامی است.
 * @param {number} input.amount  بهای خواسته یا محکوم‌به به ریال.
 * @param {string} input.result  یکی از کلیدهای RESULT_RULE_BY_VALUE، 'interlocutory'، یا 'none'.
 * @param {number} [input.appealBase] حق‌الوکالهٔ مرحلهٔ تجدیدنظر (برای سقوط تجدیدنظر).
 * @param {boolean} [input.afterReversal] قبول وکالت پس از نقض رأی (ماده ۱۸).
 * @param {boolean} [input.specialty] وکیل گواهی تخصصی دارد (ماده ۲۲ تبصره).
 * @param {number} [input.inProvinceDays] روز مأموریت داخل استان.
 * @param {number} [input.outProvinceDays] روز مأموریت خارج از استان.
 * @param {boolean} [input.temporary] وکیل تسخیری یا معاضدتی است.
 */
export function computeAttorneyForm(input) {
  const {
    subject, caseType, judgment, amount, result = 'none', appealBase,
    afterReversal = false, specialty = false, inProvinceDays = 0, outProvinceDays = 0, temporary = false,
  } = input;

  if (subject === 'tax-kanon' || subject === 'tax-markaz') {
    return fail('TAX_NOT_COMPUTED', 'تمبر مالیاتی در این ابزار محاسبه نمی‌شود؛ مبنای تمبر و سهم کانون یا مرکز در فایل تعرفهٔ مورد استناد نیست.');
  }
  if (subject !== 'attorney') return fail('INVALID_SUBJECT', 'موضوع را انتخاب کنید.');
  if (temporary) {
    return fail('ART8_UNDEFINED', 'حق‌الوکالهٔ وکیل تسخیری یا معاضدتی «دو برابر حداقل تعرفه» است، اما حداقل تعرفه در فایل تعرفه تعریف نشده؛ بنابراین محاسبه انجام نمی‌شود.');
  }

  if (caseType === 'family') {
    const ranges = [rangeOf(RULE.family, 'امور حسبی، دعاوی خانوادگی و مالی ناشی از زوجیت (ماده ۱۳ بند الف)'), rangeOf(RULE.nonfinancial, 'دعاوی غیرمالی (ماده ۱۳ بند ب)')].filter(Boolean);
    return fail('RANGE_ONLY', 'برای این نوع دعوا تعرفه بازه‌ای است و عدد قطعی ندارد؛ مبلغ دقیق توافقی یا با تصمیم مرجع رسیدگی تعیین می‌شود.', { ranges });
  }
  if (caseType === 'criminal') {
    const ranges = RULE.criminal.map((id) => rangeOf(id, rule(id)?.title || id)).filter(Boolean);
    return fail('RANGE_ONLY', 'دعاوی کیفری بر اساس نوع مرجع و مرحله بازه‌ای هستند و عدد قطعی ندارند؛ انتخاب مرحله و مبنا باید با وکیل انجام شود.', { ranges });
  }
  if (caseType === 'other') {
    const ranges = [rangeOf(RULE.other, 'سایر مواردی که در آیین‌نامه ذکر نشده (ماده ۲۸)')].filter(Boolean);
    return fail('RANGE_ONLY', 'برای این مورد تعرفه بازه‌ای است و عدد قطعی ندارد.', { ranges });
  }
  if (caseType !== 'financial') return fail('INVALID_CASE_TYPE', 'نوع دعوا را انتخاب کنید.');

  if (result === 'interlocutory') {
    const ranges = [rangeOf(RULE.interlocutory, 'اعتراض به قرارهای حقوقی قابل اعتراض (ماده ۱۲ بند ج)')].filter(Boolean);
    return fail('RANGE_ONLY', 'اعتراض به قرار حقوقی تعرفهٔ بازه‌ای دارد و عدد قطعی ندارد.', { ranges });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail('INVALID_AMOUNT', 'بهای خواسته باید عددی بزرگ‌تر از صفر باشد.');
  }

  const lines = [];
  let mainFee;
  let mainLabel;

  if (result !== 'none' && result !== undefined) {
    if (afterReversal) {
      return fail('COMBINED_UNSUPPORTED', 'قبول وکالت پس از نقض رأی و ختم دعوا با هم قابل محاسبه نیستند؛ یکی را انتخاب کنید.');
    }
    if (!(result in RESULT_RULE_BY_VALUE)) {
      return fail('INVALID_RESULT', 'نتیجهٔ ختم دعوا معتبر نیست یا در متن تعرفه معادل ندارد.');
    }
    const resultRuleId = RESULT_RULE_BY_VALUE[result];
    const isAppeal = result === 'appealBefore' || result === 'appealAfter';
    let stageBase;
    let stageLabel;
    if (isAppeal) {
      if (!Number.isFinite(appealBase) || appealBase <= 0) {
        return fail('INVALID_APPEAL_BASE', 'حق‌الوکالهٔ مرحلهٔ تجدیدنظر را به ریال وارد کنید؛ این مبنا از متن تعرفه قابل محاسبه از بهای خواسته نیست.');
      }
      stageBase = appealBase;
      stageLabel = 'حق‌الوکالهٔ مرحلهٔ تجدیدنظر (ورودی شما)';
    } else {
      // ماده ۱۲: مبنای سهم، حق‌الوکالهٔ مرحلهٔ نخستین است که از بهای خواسته با ماده ۹ بند الف تا ث به دست می‌آید.
      const base = run(RULE.f9Nonfinal, { amount });
      if (!base.ok) return fail(base.error, 'حق‌الوکالهٔ مرحلهٔ نخستین محاسبه نشد.');
      stageBase = base.fee;
      stageLabel = 'حق‌الوکالهٔ مرحلهٔ نخستین (ماده ۹ بند الف تا ث)';
      lines.push({ label: stageLabel, amount: base.fee });
    }
    const share = run(resultRuleId, { amount: stageBase });
    if (!share.ok) return fail(share.error, 'سهم ختم دعوا محاسبه نشد.');
    mainFee = share.fee;
    mainLabel = `سهم ختم دعوا (ماده ۱۲) از ${stageLabel}`;
    lines.push({ label: mainLabel, amount: share.fee });
  } else if (afterReversal) {
    // ماده ۱۸: یک‌دوم حق‌الوکالهٔ پیش از نقض (همان حق‌الوکالهٔ حکم)
    if (judgment !== 'nonfinal' && judgment !== 'final') {
      return fail('JUDGMENT_REQUIRED', 'برای محاسبهٔ حق‌الوکالهٔ پیش از نقض، نوع حکم را انتخاب کنید.');
    }
    const before = run(judgment === 'final' ? RULE.f9Final : RULE.f9Nonfinal, { amount });
    if (!before.ok) return fail(before.error, 'حق‌الوکالهٔ پیش از نقض محاسبه نشد.');
    const r18 = run(RULE.reversal, { amount: before.fee });
    if (!r18.ok) return fail(r18.error, 'سهم ماده ۱۸ محاسبه نشد.');
    mainFee = r18.fee;
    mainLabel = 'حق‌الوکالهٔ وکیلی که پس از نقض رأی می‌پذیرد (ماده ۱۸: ۱/۲ حق‌الوکالهٔ پیش از نقض)';
    lines.push({ label: 'حق‌الوکالهٔ پیش از نقض (ورودی بر اساس بهای خواسته)', amount: before.fee });
    lines.push({ label: mainLabel, amount: r18.fee });
  } else {
    if (judgment !== 'nonfinal' && judgment !== 'final') {
      return fail('JUDGMENT_REQUIRED', 'برای دعوای مالی، نوع حکم (غیرقطعی یا قطعی) را انتخاب کنید.');
    }
    const base = run(judgment === 'final' ? RULE.f9Final : RULE.f9Nonfinal, { amount });
    if (!base.ok) return fail(base.error, 'حق‌الوکاله محاسبه نشد.');
    mainFee = base.fee;
    mainLabel = judgment === 'final'
      ? 'حق‌الوکاله، حکم قطعی از حیث بهای خواسته (ماده ۹: ۱۰٪)'
      : 'حق‌الوکاله، حکم غیرقطعی (ماده ۹ بند الف تا ث)';
    lines.push({ label: mainLabel, amount: base.fee });
  }

  if (specialty) {
    const sp = run(RULE.specialty, { amount: mainFee });
    if (!sp.ok) return fail(sp.error, 'افزایش تخصصی محاسبه نشد.');
    const extra = sp.fee - mainFee;
    lines.push({ label: 'افزایش ۱۰٪ گواهی وکالت تخصصی (ماده ۲۲ تبصره، فقط در حدود صلاحیت تخصصی)', amount: extra });
    mainFee = sp.fee;
  }

  let travel = 0;
  if (inProvinceDays > 0) {
    const t = run(RULE.travelIn, { amount: inProvinceDays });
    if (!t.ok) return fail(t.error, 'فوق‌العادهٔ مأموریت داخل استان محاسبه نشد.');
    travel += t.fee;
    lines.push({ label: `فوق‌العادهٔ مأموریت داخل استان (${inProvinceDays} روز، ماده ۳۰)`, amount: t.fee });
  }
  if (outProvinceDays > 0) {
    const t = run(RULE.travelOut, { amount: outProvinceDays });
    if (!t.ok) return fail(t.error, 'فوق‌العادهٔ مأموریت خارج از استان محاسبه نشد.');
    travel += t.fee;
    lines.push({ label: `فوق‌العادهٔ مأموریت خارج از استان (${outProvinceDays} روز، ماده ۳۰)`, amount: t.fee });
  }

  return {
    ok: true,
    feeTotal: mainFee,
    travelTotal: travel,
    total: mainFee + travel,
    lines,
    mainLabel,
    notes: [
      'مالیات، تمبر مالیاتی و سهم کانون، مرکز و صندوق در این عدد نیست.',
      'هزینهٔ سفر و اقامت جداگانه و به عهدهٔ موکل است؛ این ابزار فقط فوق‌العادهٔ روزانه را محاسبه می‌کند.',
    ],
  };
}
