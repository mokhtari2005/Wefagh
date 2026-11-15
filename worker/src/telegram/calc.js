// برآورد هزینه دادرسی و حق‌الوکاله برای ربات؛ فقط از همان قاعده‌ها و موتور سایت استفاده می‌کند (بدون نرخ تکراری).
import { findRule } from '../../../site/js/calc/rates.js';
import { applyRule } from '../../../site/js/calc/engine.js';
import { computeAttorneyForm } from '../../../site/js/calc/attorney-form.js';
import { formatRial, statusLabel } from '../../../site/js/calc/result-format.js';
import { normalizeDigits } from '../../../site/js/jalali.js';

const YEAR = 1405;
const MAX_RIAL = 1e15;

export const UNOFFICIAL_NOTE = 'این عدد برآورد اولیه است و جایگزین مشورت وکیل یا تعرفهٔ رسمی نیست. مبلغ قطعی را وکیل شما تعیین می‌کند.';

const COURT_STAGES = {
  bedvi: { id: 'court-fee-financial-first', label: 'مرحلهٔ بدوی' },
  tajdid: { id: 'court-fee-financial-appeal', label: 'تجدیدنظر' },
  farjam: { id: 'court-fee-financial-cassation', label: 'فرجام‌خواهی' },
};

/**
 * «۵۰۰٬۰۰۰٬۰۰۰ ریال» یا «50000000 تومان» را به ریال تبدیل می‌کند. واحد الزامی است تا اشتباه ده‌برابری رخ ندهد.
 * @returns {{ok:true, rial:number, unit:string}|{ok:false, error:'NO_UNIT'|'NO_AMOUNT'|'TOO_BIG'}}
 */
export function parseAmount(text) {
  const t = normalizeDigits(String(text ?? '')).replace(/[٬,،\s]+/g, (m) => (/\s/.test(m) ? ' ' : ''));
  const m = t.match(/(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|هزار)?\s*(ریال|تومان|تومن)?/);
  if (!m || !m[1]) return { ok: false, error: 'NO_AMOUNT' };
  const scale = { میلیارد: 1e9, میلیون: 1e6, هزار: 1e3 }[m[2]] || 1;
  const unit = m[3] === 'ریال' ? 'ریال' : m[3] ? 'تومان' : null;
  if (!unit) return { ok: false, error: 'NO_UNIT' };
  const rial = Math.round(Number(m[1]) * scale * (unit === 'تومان' ? 10 : 1));
  if (!Number.isFinite(rial) || rial <= 0) return { ok: false, error: 'NO_AMOUNT' };
  if (rial > MAX_RIAL) return { ok: false, error: 'TOO_BIG' };
  return { ok: true, rial, unit };
}

function parseError(code) {
  if (code === 'NO_UNIT') return 'واحد مبلغ را حتماً بنویسید (ریال یا تومان) تا اشتباه ده‌برابری رخ ندهد. مثال: ۵۰۰ میلیون تومان';
  if (code === 'TOO_BIG') return 'مبلغ بیش از حد بزرگ است. لطفاً دوباره بررسی کنید.';
  return 'مبلغ را به‌صورت عدد و واحد بنویسید. مثال: ۵۰۰ میلیون تومان';
}

/** @returns {string} متن پاسخ */
export function courtFeeReply(argText) {
  const stageKey = Object.keys(COURT_STAGES).find((k) => String(argText).toLowerCase().includes(k)) || 'bedvi';
  const parsed = parseAmount(String(argText).replace(/bedvi|tajdid|farjam/gi, ''));
  if (!parsed.ok) {
    return `${parseError(parsed.error)}\n\nنمونه: /dadresi 500 میلیون تومان\nمراحل: bedvi (پیش‌فرض)، tajdid، farjam\nمثال: /dadresi 2 میلیارد تومان tajdid`;
  }
  const stage = COURT_STAGES[stageKey];
  const rule = findRule(YEAR, stage.id);
  const r = applyRule(rule, { amount: parsed.rial });
  if (!r.ok) return 'محاسبه انجام نشد؛ لطفاً با وکیل تماس بگیرید.';
  return [
    `هزینه دادرسی دعوای مالی، ${stage.label}`,
    `بهای خواسته: ${formatRial(parsed.rial)}`,
    `هزینه دادرسی: ${formatRial(r.fee)} (حدود ${(r.fee / 10).toLocaleString('fa-IR')} تومان)`,
    `وضعیت قاعده: ${statusLabel(rule.status).text}`,
    '',
    UNOFFICIAL_NOTE,
  ].join('\n');
}

/** @returns {string} متن پاسخ */
export function attorneyFeeReply(argText) {
  const final = /ghati/i.test(argText);
  const parsed = parseAmount(String(argText).replace(/ghati/gi, ''));
  if (!parsed.ok) {
    return `${parseError(parsed.error)}\n\nنمونه: /vakalat 500 میلیون تومان\nبرای حکم قطعی: /vakalat 500 میلیون تومان ghati`;
  }
  const r = computeAttorneyForm({
    subject: 'attorney', caseType: 'financial', judgment: final ? 'final' : 'nonfinal', amount: parsed.rial, result: 'none',
  });
  if (!r.ok) return `${r.message || 'محاسبه انجام نشد.'}`;
  return [
    `حق‌الوکالهٔ دعوای مالی (${final ? 'حکم قطعی' : 'حکم غیرقطعی'})`,
    `بهای خواسته: ${formatRial(parsed.rial)}`,
    `حق‌الوکاله: ${formatRial(r.feeTotal)} (حدود ${(r.feeTotal / 10).toLocaleString('fa-IR')} تومان)`,
    ...r.notes,
    '',
    UNOFFICIAL_NOTE,
  ].join('\n');
}
