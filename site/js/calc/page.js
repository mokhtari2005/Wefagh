// صفحهٔ محاسبه‌گرها. فرم‌ها با DOM امن ساخته می‌شوند؛ خروجی فقط متن است. تاریخ‌ها شمسی وارد می‌شوند.
import { delayInterest, strictNumber } from './core.js';
import { applyRule } from './engine.js';
import { findRule, rulesFor } from './rates.js';
import { formatShamsi } from '../shamsi.js';
import { parseShamsiInput, isoToShamsiInput } from '../jalali.js';
import { shamsiField } from '../shamsi-field.js';
import { normalizeLimitations, formatNumbersInLine, formatRial, statusLabel } from './result-format.js';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** کارت نتیجه: یک الگوی مشترک برای همهٔ محاسبه‌گرها. متن فقط با textContent نمایش داده می‌شود. */
const INPUT_MESSAGES = {
  INVALID_DATES: 'تاریخ شروع و پایان باید شمسی و معتبر باشد (مثال: ۱۴۰۵/۰۸/۰۶) و پایان بعد از شروع باشد.',
  INVALID_PRINCIPAL: 'اصل دین باید عددی بزرگ‌تر از صفر باشد.',
  INVALID_RATE: 'نرخ باید عددی بین ۰ و ۱۰۰ باشد. نرخ را از منبع رسمی همان دوره وارد کنید.',
  INVALID_AMOUNT: 'مبلغ باید عددی نامنفی باشد.',
  INVALID_UNITS: 'تعداد روز باید عدد صحیح و نامنفی باشد.',
  INVALID_COUNT: 'تعداد وارد‌شده باید عدد صحیح و در محدودهٔ این قاعده باشد (مثلاً حداقل ۱ یا ۲).',
};

function resultBox(result, form = null) {
  if (!result.ok) {
    const specific = INPUT_MESSAGES[result.error];
    return h('div', { class: 'notice', role: 'alert', text: specific || 'ورودی‌ها را بررسی کنید؛ تاریخ‌ها باید شمسی و معتبر باشند (مثال: ۱۴۰۵/۰۸/۰۶) و مبالغ و نرخ‌ها عددی باشند.' });
  }
  const status = result.status ? statusLabel(result.status) : null;
  const head = h('div', { class: 'result-head' }, [
    h('h3', { text: result.title || 'نتیجهٔ محاسبه' }),
    ...(status ? [h('span', { class: `status-badge ${status.tone}`, text: status.text })] : []),
  ]);
  const box = h('div', { class: 'result', role: 'status', 'aria-live': 'polite' }, [head]);

  // مبلغ نهایی: برجسته و با واحد صریح
  if (typeof result.fee === 'number') {
    box.append(h('div', { class: 'amount-block' }, [
      h('span', { class: 'amount-label', text: 'مبلغ محاسبه‌شده' }),
      h('span', { class: 'amount-value', text: formatRial(result.fee) }),
    ]));
  }

  const facts = [];
  if (result.lastDay) facts.push(['آخرین روز', formatShamsi(new Date(result.lastDay + 'T12:00:00Z'))]);
  if (typeof result.interest === 'number') facts.push(['خسارت', formatRial(result.interest)]);
  if (typeof result.total === 'number') facts.push(['جمع با اصل', formatRial(result.total)]);
  if (facts.length) {
    box.append(h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
  }

  // جزئیات: هر مرحله یک مورد؛ تاریخ‌های میلادی شمسی و عددها جداکننده دارند
  const shamsiLine = (line) => line.replace(/\d{4}-\d{2}-\d{2}/g, (iso) => isoToShamsiInput(iso));
  const steps = Array.isArray(result.steps) ? result.steps : [];
  if (steps.length) {
    box.append(h('h4', { text: 'جزئیات محاسبه' }));
    const ol = h('ol', { class: 'steps' });
    for (const line of steps) ol.append(h('li', { text: formatNumbersInLine(shamsiLine(line)) }));
    box.append(ol);
  }

  // محدودیت‌ها: فقط اگر وجود دارند؛ هر مورد کامل و جدا
  const limits = normalizeLimitations(result.limitations);
  if (limits.length) {
    box.append(h('h4', { text: 'محدودیت‌ها' }));
    const ul = h('ul', { class: 'limits' });
    for (const item of limits) ul.append(h('li', { text: item }));
    box.append(ul);
  }

  if (result.ruleVersion) box.append(h('p', { class: 'muted', text: `نسخهٔ قاعده: ${result.ruleVersion}` }));

  // اقدامات کاربر
  if (form) {
    const again = h('button', { class: 'btn small secondary', type: 'button', text: 'محاسبه مجدد' });
    again.addEventListener('click', () => form.requestSubmit());
    const edit = h('button', { class: 'btn small secondary', type: 'button', text: 'ویرایش ورودی‌ها' });
    edit.addEventListener('click', () => form.querySelector('input, select, textarea')?.focus());
    box.append(h('div', { class: 'row result-actions' }, [again, edit]));
  }
  return box;
}

function field(id, label, input) {
  input.id = id;
  return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input]);
}

function delayTool() {
  const principal = h('input', { type: 'number', min: '1', step: '1', required: '', inputmode: 'numeric' });
  const rate = h('input', { type: 'number', min: '0', max: '100', step: '0.01', required: '', inputmode: 'decimal' });
  const start = shamsiField('di-start', 'تاریخ سررسید (شمسی)', { required: true });
  const end = shamsiField('di-end', 'تاریخ محاسبه (شمسی)', { required: true });
  const out = h('div');
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'محاسبه خسارت تأخیر تأدیه' }, [
    field('di-principal', 'مبلغ اصل دین (ریال)', principal),
    field('di-rate', 'نرخ سالانه (٪) — از منبع رسمی وارد کنید', rate),
    start.node,
    end.node,
    h('button', { class: 'btn', type: 'submit', text: 'محاسبه خسارت' }),
    out,
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = delayInterest({
      principal: strictNumber(principal.value),
      ratePercent: strictNumber(rate.value),
      startDate: parseShamsiInput(start.input.value) ?? '',
      endDate: parseShamsiInput(end.input.value) ?? '',
    });
    out.replaceChildren(resultBox(result, form));
  });
  return h('section', { class: 'tool' }, [h('h2', { text: 'خسارت تأخیر تأدیه (روش ساده)' }), form]);
}

/** هزینهٔ دادرسی و حق‌الوکاله: قواعد تأییدشده از فهرست rates.js؛ نرخ‌ها از متن مستند است. */
const RATE_YEAR = 1405;

function unverifiedBox(rule) {
  const reason = rule.status === 'text_read'
    ? 'متن بازنشرشده خوانده شده، اما با روزنامهٔ رسمی تطبیق نشده است.'
    : 'منبع قابل استناد برای این نرخ احراز نشده است.';
  const children = [
    h('p', { text: `محاسبه برای «${rule.title}» انجام نمی‌شود.` }),
    h('p', { text: `دلیل: ${reason}` }),
    h('p', { class: 'muted', text: `مستند: ${rule.legal.citation}` }),
  ];
  if (rule.interpretation?.note) children.push(h('p', { class: 'muted', text: `مسئلهٔ تفسیری: ${rule.interpretation.note}` }));
  if (rule.note) children.push(h('p', { class: 'muted', text: rule.note }));
  return h('div', { class: 'notice', role: 'alert' }, children);
}

/** فهرست بازه‌های متن که مبلغ قطعی نمی‌دهند؛ فقط برای مرجع. */
function rangeList(group) {
  const items = rulesFor(RATE_YEAR, group).filter((r) => r.kind === 'range' || r.kind === 'discretionary');
  if (!items.length) return null;
  const ul = h('ul', { class: 'limits' });
  for (const r of items) {
    let text;
    if (r.kind === 'discretionary') {
      text = 'تشخیص کانون یا مرکز (بدون مبلغ قطعی)';
    } else {
      const parts = [];
      if (typeof r.min === 'number') parts.push(`حداقل ${formatRial(r.min)}`);
      if (typeof r.max === 'number') parts.push(`حداکثر ${formatRial(r.max)}`);
      text = parts.join(' و ') || 'بدون مبلغ عددی';
      if (r.maxPercent) text += ` (سقف ${r.maxPercent}٪ ${r.percentBase || ''})`;
      if (r.unit) text += ` ${r.unit}`;
    }
    ul.append(h('li', { text: `${r.title}: ${text}` }));
  }
  return h('details', { class: 'tariff-ranges' }, [
    h('summary', { text: 'بازه‌ها و موارد تشخیصی متن (محاسبه نمی‌شوند)' }),
    ul,
  ]);
}

/** ابزار قاعده‌محور: کاربر نوع/مرحله را انتخاب می‌کند و موتور فقط قاعدهٔ تأییدشده را اعمال می‌کند. */
function ruleTool({ title, amountLabel, group, submitLabel, note, withRanges = false }) {
  // قواعدی که فقط متن خوانده‌شده‌اند یا بازه‌اند، در فهرست محاسبه نمی‌آیند.
  const usable = rulesFor(RATE_YEAR, group).filter((r) => r.status !== 'text_read' && r.kind !== 'range' && r.kind !== 'discretionary');
  const select = h('select', { id: `${title}-kind` }, usable.map((r) => h('option', { value: r.id, text: r.title })));
  const amountCaption = h('label', { for: `${title}-amount`, text: amountLabel });
  const amount = h('input', { id: `${title}-amount`, type: 'number', min: '0', step: '1', required: '', inputmode: 'numeric' });
  const countCaption = h('label', { for: `${title}-count`, text: '' });
  const count = h('input', { id: `${title}-count`, type: 'number', min: '1', step: '1', inputmode: 'numeric' });
  const countWrap = h('div', { class: 'field', hidden: '' }, [countCaption, count]);
  const out = h('div');

  function syncInputs() {
    const rule = findRule(RATE_YEAR, select.value);
    amountCaption.textContent = rule?.inputLabel || amountLabel;
    const needsCount = Boolean(rule?.extraInput);
    countWrap.hidden = !needsCount;
    countCaption.textContent = rule?.extraInput?.label || '';
    count.required = needsCount;
  }
  select.addEventListener('change', syncInputs);
  syncInputs();

  const form = h('form', { class: 'form', novalidate: '', 'aria-label': title }, [
    field(`${title}-kind`, 'نوع و مرحله', select),
    h('div', { class: 'field' }, [amountCaption, amount]),
    countWrap,
    h('button', { class: 'btn', type: 'submit', text: submitLabel }),
    out,
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rule = findRule(RATE_YEAR, select.value);
    if (!rule) return out.replaceChildren(resultBox({ ok: false }, form));
    const r = applyRule(rule, {
      amount: strictNumber(amount.value),
      count: rule.extraInput ? strictNumber(count.value) : undefined,
    });
    if (!r.ok && r.error === 'RULE_UNVERIFIED') return out.replaceChildren(unverifiedBox(rule));
    if (!r.ok) return out.replaceChildren(resultBox({ ok: false, error: r.error }, form));
    const approval = rule.status === 'user_approved'
      ? 'این نتیجه بر اساس تأیید کاربر برای استفاده در ماشین‌حساب است؛ احراز رسمی از روزنامهٔ رسمی انجام نشده است.'
      : null;
    out.replaceChildren(resultBox({
      ok: true,
      title,
      status: rule.status,
      ruleVersion: `${rule.id} / سال ${RATE_YEAR}`,
      steps: r.steps,
      fee: r.fee,
      limitations: [...(Array.isArray(note) ? note : [note]), rule.note, approval],
    }, form));
  });
  const children = [h('h2', { text: title }), form];
  if (withRanges) {
    const list = rangeList(group);
    if (list) children.push(list);
  }
  return h('section', { class: 'tool' }, children);
}

export function calculatorsPage(params = {}) {
  const page = h('div', {}, [
    h('h1', { text: 'محاسبه‌گرهای حقوقی' }),
    h('div', {
      class: 'notice',
      role: 'note',
      text: 'این ابزارها پیش‌نویس محاسباتی هستند و جای تشخیص وکیل را نمی‌گیرند. قواعد هر ابزار و منبع آن در همان بخش نشان داده می‌شود. تاریخ‌ها شمسی وارد می‌شوند.',
    }),
    h('section', { id: 'calc-court' }, [ruleTool({
      title: 'هزینهٔ دادرسی',
      amountLabel: 'مبلغ مبنا (ریال)',
      group: 'court',
      submitLabel: 'محاسبه هزینهٔ دادرسی',
      note: ['مبنای محاسبه (خواسته یا محکوم‌به) و نحوهٔ اعمال هر پله باید مطابق متن رسمی باشد.', 'این ابزار پیش‌نویس است و پیش از ثبت دادخواست باید بازبینی شود.'],
    })]),
    h('section', { id: 'calc-attorney' }, [ruleTool({
      title: 'حق‌الوکاله قانونی',
      amountLabel: 'مبلغ مبنا (ریال)',
      group: 'attorney',
      submitLabel: 'محاسبه حق‌الوکاله قانونی',
      note: [
        'منبع: آیین‌نامه تعرفه حق‌الوکاله، حق‌المشاوره و هزینه سفر وکلای دادگستری، مصوب ۱۳۹۸/۱۲/۲۸ (فایل fd69f537). این عدد تعرفهٔ قانونی است؛ حق‌الوکالهٔ توافقی جداگانه تعیین می‌شود.',
        'مالیات، تمبر و سهم کانون، مرکز و صندوق محاسبه نشده‌اند؛ مبنای تمبر مالیاتی در این فایل نیست.',
      ],
      withRanges: true,
    })]),
    h('section', { id: 'calc-delay' }, [delayTool()]),
  ]);
  // پارامتر tool از کارت‌های آکادمی می‌آید؛ به بخش مربوط می‌رسیم.
  const target = { court: 'calc-court', attorney: 'calc-attorney', delay: 'calc-delay' }[params.tool];
  if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }), 0);
  return page;
}
