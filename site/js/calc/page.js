// صفحهٔ محاسبه‌گرها. فرم‌ها با DOM امن ساخته می‌شوند؛ خروجی فقط متن است. تاریخ‌ها شمسی وارد می‌شوند.
import { delayInterest, strictNumber } from './core.js';
import { applyRule } from './engine.js';
import { findRule, rulesFor } from './rates.js';
import { formatShamsi } from '../shamsi.js';
import { parseShamsiInput, isoToShamsiInput, shamsiToIso, normalizeDigits } from '../jalali.js';
import { cpiCoverage, CPI_SOURCE } from './cpi-data.js';
import { shamsiField } from '../shamsi-field.js';
import { normalizeLimitations, formatNumbersInLine, formatRial, statusLabel } from './result-format.js';
import { indexedDelayDamage, planDelayPeriod, periodLabel, periodKeyOfIso } from './indexation.js';

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

  const facts = [...(Array.isArray(result.facts) ? result.facts : [])];
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
  return h('div', { class: 'manual-rate-body' }, [form]);
}


const INDEXED_ERRORS = {
  INVALID_PRINCIPAL: 'اصل دین باید عددی بزرگ‌تر از صفر باشد.',
  INVALID_DATES: 'سال و ماه سررسید یا مطالبه (طبق مبنای شروع)، و سال و ماه پایان محاسبه را از فهرست‌ها انتخاب کنید.',
  INVALID_PERIOD: 'تاریخ پایان باید بعد از تاریخ شروع باشد.',
  INVALID_PAYMENT: 'وضعیت پرداخت را انتخاب کنید.',
  PARTIAL_PAYMENT_UNSUPPORTED: 'پرداخت جزئی در این ابزار پشتیبانی نمی‌شود؛ محاسبه تنها برای «پرداخت نشده» یا «پرداخت کامل» انجام می‌شود. برای پرداخت جزئی باید محاسبهٔ تفکیکی توسط وکیل انجام شود.',
};

/** خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی: محاسبهٔ مشروط؛ احراز شرایط قانونی با کاربر یا وکیل است. */
// فهرست سال‌ها گسترده‌تر از پوشش داده است تا تاریخ خارج از محدوده انتخاب و با پیام روشن رد شود.
const INDEX_YEARS = [1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406];
const MONTH_NAMES_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** فهرست‌های کشویی سال و ماه. خروجی iso() اولین روز ماه شمسی انتخاب‌شده است، یا '' اگر کامل نباشد. */
function monthFields(idPrefix, labels) {
  const year = h('select', { id: `${idPrefix}-year`, 'aria-label': labels.year }, [
    h('option', { value: '', text: 'سال را انتخاب کنید' }),
    ...INDEX_YEARS.map((y) => h('option', { value: String(y), text: faDigits(y) })),
  ]);
  const month = h('select', { id: `${idPrefix}-month`, 'aria-label': labels.month }, [
    h('option', { value: '', text: 'ماه را انتخاب کنید' }),
    ...MONTH_NAMES_FA.map((name, i) => h('option', { value: String(i + 1), text: name })),
  ]);
  const yearLabel = h('label', { for: `${idPrefix}-year`, text: labels.year });
  const monthLabel = h('label', { for: `${idPrefix}-month`, text: labels.month });
  return {
    nodes: [
      h('div', { class: 'field' }, [yearLabel, year]),
      h('div', { class: 'field' }, [monthLabel, month]),
    ],
    iso() {
      const y = Number(year.value);
      const m = Number(month.value);
      if (!y || !m) return '';
      return shamsiToIso(y, m, 1) ?? '';
    },
    setLabels(next) {
      yearLabel.textContent = next.year;
      monthLabel.textContent = next.month;
      year.setAttribute('aria-label', next.year);
      month.setAttribute('aria-label', next.month);
    },
  };
}

/** مبلغ ریالی: فقط رقم می‌پذیرد و با جداکنندهٔ سه‌رقمی نمایش می‌دهد. */
function amountDigits(text) {
  return normalizeDigits(text).replace(/[^\d]/g, '');
}

function parseAmount(text) {
  const digits = amountDigits(text);
  return digits ? Number(digits) : NaN;
}

function groupAmount(text) {
  const digits = amountDigits(text);
  return digits ? Number(digits).toLocaleString('fa-IR') : '';
}

function indexedDelayTool() {
  const cov = cpiCoverage();
  const coverageText = `داده‌های شاخص از ${periodLabel(cov.first)} تا ${periodLabel(cov.last)} موجود است (${CPI_SOURCE.shortTitle}، ${CPI_SOURCE.reportPublishedAt}). آخرین ماه قابل محاسبه: ${periodLabel(cov.last)}. ماه‌های خارج از این بازه محاسبه نمی‌شوند.`;
  const coverage = h('div', { class: 'notice', role: 'status', text: coverageText });

  const period = h('select', { id: 'dix-period' }, [
    h('option', { value: 'monthly', text: 'ماهانه (بر اساس شاخص ماهانه بانک مرکزی)' }),
  ]);
  const obligation = h('select', { id: 'dix-obligation' }, [
    h('option', { value: 'money', text: 'دین پولی (وجه نقد یا مبلغ ریالی)' }),
    h('option', { value: 'other', text: 'سایر تعهدات (این ابزار پشتیبانی نمی‌کند)' }),
  ]);
  const paymentStatus = h('select', { id: 'dix-payment' }, [
    h('option', { value: 'unpaid', text: 'پرداخت نشده است' }),
    h('option', { value: 'full', text: 'پرداخت کامل شده است' }),
    h('option', { value: 'partial', text: 'پرداخت جزئی شده است (پشتیبانی نمی‌شود)' }),
  ]);
  const endFields = monthFields('dix-end', { year: 'سال محاسبه', month: 'ماه محاسبه' });
  const dueFields = monthFields('dix-due', { year: 'سال سررسید', month: 'ماه سررسید' });
  const demandFields = monthFields('dix-demand', { year: 'سال مطالبه', month: 'ماه مطالبه' });
  const startBasis = h('select', { id: 'dix-start-basis' }, [
    h('option', { value: 'due', text: 'تاریخ سررسید' }),
    h('option', { value: 'demand', text: 'تاریخ مطالبه' }),
  ]);
  const principal = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'مثال: ۷۰۰٬۰۰۰٬۰۰۰' });
  principal.addEventListener('input', () => {
    principal.value = groupAmount(principal.value);
  });
  const endLabels = {
    unpaid: { year: 'سال محاسبه', month: 'ماه محاسبه' },
    full: { year: 'سال پرداخت', month: 'ماه پرداخت' },
  };
  paymentStatus.addEventListener('change', () => endFields.setLabels(endLabels[paymentStatus.value] ?? endLabels.unpaid));

  const out = h('div');
  const form = h('form', { class: 'form dix-form', novalidate: '', 'aria-label': 'خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی' }, [
    coverage,
    field('dix-period', 'نوع محاسبه', period),
    field('dix-obligation', 'نوع تعهد', obligation),
    field('dix-payment', 'وضعیت پرداخت تا تاریخ پایان', paymentStatus),
    ...endFields.nodes,
    ...dueFields.nodes,
    ...demandFields.nodes,
    field('dix-start-basis', 'مبنای شروع تأخیر (انتخاب شما)', startBasis),
    field('dix-principal', 'مبلغ دین (ریال)', principal),
    h('p', { class: 'muted', text: 'مبنای قانونی انتخاب تاریخ شروع و پایان در این ابزار احراز نشده است. تاریخ شروع را بر اساس قرارداد یا حکم انتخاب کنید.' }),
    h('button', { class: 'btn dix-submit', type: 'submit', text: 'محاسبه' }),
    out,
  ]);

  const fail = (text) => out.replaceChildren(h('div', { class: 'notice', role: 'alert', text }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (obligation.value !== 'money') {
      return fail('این ابزار فقط برای دین پولی است؛ برای سایر تعهدات محاسبه انجام نمی‌شود.');
    }
    const startFields = startBasis.value === 'due' ? dueFields : demandFields;
    const startIso = startFields.iso();
    const calcIso = endFields.iso();
    if (!startIso || !calcIso) {
      return fail(INDEXED_ERRORS.INVALID_DATES);
    }
    const amount = parseAmount(principal.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(INDEXED_ERRORS.INVALID_PRINCIPAL);
    }
    const plan = planDelayPeriod({
      startIso,
      calcIso,
      payment: { status: paymentStatus.value, dateIso: paymentStatus.value === 'full' ? calcIso : undefined },
    });
    if (!plan.ok) {
      return fail(INDEXED_ERRORS[plan.error] || 'ورودی‌ها را بررسی کنید.');
    }
    const r = indexedDelayDamage({
      principal: amount,
      startIso,
      endIso: plan.endIso,
      startBasis: startBasis.value === 'due' ? 'تاریخ سررسید' : 'تاریخ مطالبه',
      endBasis: plan.endBasis,
    });
    if (!r.ok) {
      let text = INDEXED_ERRORS[r.error] || 'ورودی‌ها را بررسی کنید.';
      if (r.error === 'NO_INDEX_DATA') {
        const lines = r.outside.map((o) => (o.side === 'before'
          ? `${periodLabel(o.periodKey)} قبل از اولین ماه جدول (${periodLabel(r.coverage.first)}) است.`
          : `${periodLabel(o.periodKey)} بعد از آخرین ماه جدول (${periodLabel(r.coverage.last)}) است؛ شاخص آن هنوز در داده‌های معتبر نیست.`));
        text = `${lines.join(' ')} محاسبه انجام نمی‌شود و عدد تقریبی ساخته نمی‌شود.`;
      }
      return fail(text);
    }
    const facts = [
      ['ماه مبنا (شروع)', r.startIndex.period],
      ['شاخص مبدأ', `${r.startIndex.index} (گزارش صفحه ${r.source.startPage})`],
      ['ماه مقصد (پایان)', r.endIndex.period],
      ['شاخص مقصد', `${r.endIndex.index} (گزارش صفحه ${r.source.endPage})`],
      ['ضریب تعدیل', r.ratio.toFixed(6)],
      ['فرمول', r.formula],
      ['اصل دین', formatRial(r.principal)],
    ];
    out.replaceChildren(resultBox({
      ok: true,
      title: 'محاسبهٔ مشروط؛ احراز شرایط قانونی لازم است',
      facts,
      interest: r.interest,
      total: r.total,
      steps: r.steps,
      ruleVersion: `شاخص بهای کالاها و خدمات مصرفی، ${r.source.reportPublishedAt} (فایل ${r.source.file})`,
      limitations: [
        `پایان محاسبه: ${plan.endBasis}.`,
        'این عدد مشروط است؛ تا شرایط زیر احراز نشود، به‌عنوان مبلغ قطعی استفاده نکنید:',
        ...r.requiredVerification,
        `منبع شاخص‌ها: ${r.source.publisher}، ${r.source.title}، صفحه‌های ${r.source.startPage} و ${r.source.endPage} فایل؛ سایت رسمی بانک مرکزی بررسی نشده است.`,
        `جدول شاخص از ${periodLabel(r.coverage.first)} تا ${periodLabel(r.coverage.last)} داده دارد.`,
      ],
    }));
  });
  return h('div', { class: 'indexed-body' }, [form]);
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
    h('section', { id: 'calc-delay' }, [
      h('h2', { text: 'خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی' }),
      h('p', { class: 'muted', text: 'روش اصلی: خسارت از جدول شاخص ماهانهٔ بانک مرکزی محاسبه می‌شود. برای این روش نرخ سالانه وارد نمی‌کنید.' }),
      indexedDelayTool(),
      h('details', { class: 'manual-rate' }, [
        h('summary', { text: 'روش فرعی: نرخ سالانهٔ دستی (فقط وقتی نرخ مشخص و مستند دارید)' }),
        h('p', { class: 'muted', text: 'این روش جداگانه است و با جدول شاخص بانک مرکزی ترکیب نمی‌شود. نرخ را فقط از منبع رسمی و مستند وارد کنید.' }),
        delayTool(),
      ]),
    ]),
  ]);
  // پارامتر tool از کارت‌های آکادمی می‌آید؛ به بخش مربوط می‌رسیم.
  const target = { court: 'calc-court', attorney: 'calc-attorney', delay: 'calc-delay' }[params.tool];
  if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }), 0);
  return page;
}
