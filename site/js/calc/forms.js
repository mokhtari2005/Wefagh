// قالب کاربرگ A4 برای خروجی محاسبه‌گرها (مطابق فرم‌های مرجع آکادمی: هزینه دادرسی، حق‌الوکاله، ارزش منطقه‌ای).
// خالص و بدون DOM؛ فقط رشتهٔ HTML می‌سازد. همهٔ عددها از نتیجهٔ موتور محاسبه می‌آیند و اینجا هیچ نرخی ساخته نمی‌شود.
// هیچ style درون‌خطی استفاده نمی‌شود (CSP سایت style-src 'self' است)؛ ظاهر فقط با کلاس‌های styles.css است.

export const BRAND_FA = 'آکادمی وکالت شهرام مختاری';
export const BRAND_EN = 'Shahram Mokhtari Law Academy';
export const BRAND_SUB = 'مرکز آموزش تخصصی دعاوی ملکی و حقوقی';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const fa = (n) => Number(n).toLocaleString('fa-IR');
export const faNumber = fa;
export const faPercent = (p) => `${fa(p)}٪`;

/** ردیف‌های جدول پله‌ای هزینهٔ دادرسی / حق‌الوکاله: [شرح، مبلغ مشمول، درصد، مبلغ]. جمع ردیف‌ها با fee موتور تطبیق داده می‌شود. */
export function tierTableRows(rule, amount, fee) {
  const rows = [];
  if (!rule) return rows;
  if (rule.kind === 'tiered' && Array.isArray(rule.tiers)) {
    if (rule.mode === 'whole') {
      const band = rule.tiers.find((t) => t.upTo === null || amount <= t.upTo) || rule.tiers[rule.tiers.length - 1];
      rows.push({ label: 'نرخ بر کل مبلغ مبنا', base: amount, percent: band.percent, fee: Math.round((amount * band.percent) / 100) });
    } else {
      let lower = 0;
      rule.tiers.forEach((tier, i) => {
        const top = tier.upTo === null ? Math.max(amount, lower) : Math.min(amount, tier.upTo);
        const part = Math.max(0, top - lower);
        const label = tier.upTo === null
          ? `پلهٔ ${fa(i + 1)}: مازاد بر ${fa(lower)} ریال`
          : (i === 0 ? `پلهٔ ${fa(i + 1)}: تا سقف ${fa(tier.upTo)} ریال` : `پلهٔ ${fa(i + 1)}: مازاد بر ${fa(lower)} تا ${fa(tier.upTo)} ریال`);
        rows.push({ label, base: part, percent: tier.percent, fee: Math.round((part * tier.percent) / 100) });
        if (tier.upTo !== null) lower = tier.upTo;
      });
    }
  } else if (rule.kind === 'fixed') {
    rows.push({ label: 'مبلغ ثابت طبق تعرفه', base: null, percent: null, fee });
  } else {
    rows.push({ label: rule.title || 'محاسبه', base: amount, percent: null, fee });
  }
  const sum = rows.reduce((s, r) => s + r.fee, 0);
  if (Number.isFinite(fee) && sum !== fee) {
    rows.push({ label: 'تعدیل کف یا سقف قانونی', base: null, percent: null, fee: fee - sum });
  }
  return rows;
}

/** بخش جدول پله‌ای برای مدل کاربرگ. */
export function tierSection(title, rows, note) {
  return {
    type: 'table',
    title,
    columns: ['شرح پله / مرحله', 'مبلغ مشمول محاسبه (ریال)', 'درصد تعرفه', 'مبلغ (ریال)'],
    rows: rows.map((r) => [r.label, r.base === null ? '—' : fa(r.base), r.percent === null ? '—' : faPercent(r.percent), fa(r.fee)]),
    note: note || '',
  };
}

/**
 * مدل کاربرگ از نتیجهٔ یک محاسبه‌گر.
 * @param {object} p
 * @param {string} p.title عنوان کاربرگ
 * @param {Array<[string,string]>} p.inputs مشخصات و داده‌های ورودی
 * @param {object} p.result نتیجه (facts, steps, limitations, fee, interest, total, ruleVersion)
 * @param {Array<object>} [p.tables] بخش‌های جدولی (بعد از ورودی‌ها)
 * @param {{label:string,value:string}} [p.totalOverride]
 */
export function buildFormModel({ title, inputs = [], result = {}, tables = [], totalOverride = null }) {
  const sections = [];
  if (inputs.length) sections.push({ type: 'fields', title: 'مشخصات و داده‌های پایه محاسبه', rows: inputs });
  for (const t of tables) sections.push(t);
  const facts = Array.isArray(result.facts) ? result.facts : [];
  if (facts.length) sections.push({ type: 'table', title: 'جزئیات و مبانی محاسبه', columns: ['عنوان', 'مقدار'], rows: facts.map(([a, b]) => [a, b]) });
  const steps = Array.isArray(result.steps) ? result.steps.filter(Boolean) : [];
  if (steps.length && !tables.length) sections.push({ type: 'list', title: 'مراحل محاسبه', items: steps });
  const limits = Array.isArray(result.limitations) ? result.limitations.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (limits.length || result.ruleVersion) {
    sections.push({ type: 'notes', title: 'توضیحات و ملاحظات حقوقی', items: limits, footnote: result.ruleVersion ? `نسخهٔ قاعده و مستند: ${result.ruleVersion}` : '' });
  }
  let total = totalOverride;
  if (!total) {
    if (typeof result.fee === 'number') total = { label: 'مبلغ نهایی محاسبه‌شده', value: `${fa(result.fee)} ریال` };
    else if (typeof result.total === 'number') total = { label: 'جمع با اصل', value: `${fa(result.total)} ریال` };
  }
  const extraTotals = [];
  if (typeof result.interest === 'number') extraTotals.push({ label: 'خسارت محاسبه‌شده', value: `${fa(result.interest)} ریال` });
  return { title, sections, total, extraTotals };
}

function renderSection(section, index) {
  const head = `<b class="academy-pdf-section-title">${escapeHtml(fa(index))}. ${escapeHtml(section.title)}</b>`;
  let body = '';
  if (section.type === 'fields') {
    body = '<div class="academy-pdf-fields">' + section.rows.map(([a, b]) =>
      `<div class="academy-pdf-field"><b>${escapeHtml(a)}</b><span>${escapeHtml(b)}</span></div>`).join('') + '</div>';
  } else if (section.type === 'table') {
    body = '<table class="academy-pdf-table"><thead><tr>' + section.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') +
      '</tr></thead><tbody>' + section.rows.map((r) => '<tr>' + r.map((c, i) => `<td${i > 0 ? ' class="num"' : ''}>${escapeHtml(c)}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>' + (section.note ? `<p class="academy-pdf-note">${escapeHtml(section.note)}</p>` : '');
  } else if (section.type === 'list') {
    body = '<ol class="academy-pdf-list">' + section.items.map((s) => `<li>${escapeHtml(s)}</li>`).join('') + '</ol>';
  } else if (section.type === 'notes') {
    body = (section.items.length ? '<ul class="academy-pdf-list">' + section.items.map((s) => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>' : '') +
      (section.footnote ? `<p class="academy-pdf-note">${escapeHtml(section.footnote)}</p>` : '');
  } else if (section.type === 'html') {
    body = `<div class="academy-pdf-content">${section.html}</div>`;
  }
  return `<section class="academy-pdf-section">${head}${body}</section>`;
}

/** HTML کامل صفحهٔ کاربرگ (برای نوشتن در پنجرهٔ گزارش). */
export function renderFormHtml(model, { dateText = '', cssHref = '/css/styles.css', logoHref = '/assets/mla-academy-logo.svg?v=20261121-mla-1' } = {}) {
  const meta = `<div class="academy-pdf-meta"><div><b>شماره پرونده:</b><span></span></div><div><b>تاریخ تنظیم:</b><span>${escapeHtml(dateText)}</span></div></div>`;
  const sections = model.sections.map((s, i) => renderSection(s, i + 1)).join('');
  const extra = (model.extraTotals || []).map((t) => `<div class="academy-pdf-total secondary"><span>${escapeHtml(t.label)}</span><strong>${escapeHtml(t.value)}</strong></div>`).join('');
  const total = model.total ? `<div class="academy-pdf-total"><span>${escapeHtml(model.total.label)}</span><strong>${escapeHtml(model.total.value)}</strong></div>` : '';
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escapeHtml(model.title || 'کاربرگ محاسباتی') + '</title><link rel="stylesheet" href="' + escapeHtml(cssHref) + '"></head><body class="academy-pdf-body">' +
    '<main class="academy-pdf-sheet"><header class="academy-pdf-header"><img src="' + escapeHtml(logoHref) + '" alt="MLA — Shahram Mokhtari Law Academy"></header><h1>' + escapeHtml(model.title || 'فرم محاسبات حقوقی') + '</h1>' + meta + sections + extra + total +
    '<div class="academy-pdf-sign"><div>نام و نام خانوادگی تنظیم‌کننده:<span></span></div><div>امضاء و تاریخ:<span></span></div></div>' +
    '<footer class="academy-pdf-footer">' + BRAND_FA + ' | کاربرگ آموزشی و کاربردی محاسبات حقوقی | mokhtari.ir</footer></main></body></html>';
}

/** متن ساده برای دریافت txt. */
export function renderFormText(model, dateText = '') {
  const lines = [BRAND_FA, BRAND_EN, model.title, dateText ? `تاریخ تنظیم: ${dateText}` : ''];
  model.sections.forEach((s, i) => {
    lines.push('', `${fa(i + 1)}. ${s.title}`);
    if (s.type === 'fields') s.rows.forEach(([a, b]) => lines.push(`${a}: ${b}`));
    else if (s.type === 'table') s.rows.forEach((r) => lines.push(r.join(' | ')));
    else if (s.type === 'list' || s.type === 'notes') (s.items || []).forEach((x) => lines.push(`- ${x}`));
    else if (s.type === 'html') lines.push(String(s.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  });
  (model.extraTotals || []).forEach((t) => lines.push(`${t.label}: ${t.value}`));
  if (model.total) lines.push('', `${model.total.label}: ${model.total.value}`);
  return lines.filter((l) => l !== undefined).join('\n');
}

/** نگاشت گره نتیجه ← مدل گزارش (برای اینکه دکمهٔ چاپ بداند چه چیزی را در قالب فرم بچیند). */
const registry = new WeakMap();
export function registerReport(node, builder) { registry.set(node, builder); }
export function getReportBuilder(node) { return registry.get(node) || null; }
