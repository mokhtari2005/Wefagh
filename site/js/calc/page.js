// صفحهٔ محاسبه‌گرها. فرم‌ها با DOM امن ساخته می‌شوند؛ خروجی فقط متن است. تاریخ‌ها شمسی وارد می‌شوند.
import { delayInterest } from './core.js';
import { applyRule } from './engine.js';
import { findRule, rulesFor } from './rates.js';
import { formatShamsi } from '../shamsi.js';
import { parseShamsiInput, isoToShamsiInput, shamsiToIso, normalizeDigits } from '../jalali.js';
import { cpiFor, cpiAnnualFor, cpiCoverage, CPI_SOURCE } from './cpi-data.js';
import { shamsiField } from '../shamsi-field.js';
import { normalizeLimitations, formatNumbersInLine, formatRial, statusLabel } from './result-format.js';
import { indexedDelayDamage, planDelayPeriod, periodLabel, periodKeyOfIso } from './indexation.js';
import { computeAttorneyForm, RULE as ATTORNEY_RULE } from './attorney-form.js?v=20261121-attorney-2';
import { buildFormModel, registerReport, getReportBuilder, tierSection, tierTableRows } from './forms.js?v=20261121-mla-brand-1';
import { icon } from '../icons.js?v=20261119-2';
import { regionalValueTool } from '../regional-value.js?v=20261125-tehran-1405';
import { createA4TextReport } from './report.js?v=20261121-pdf-a4-1';

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
  registerReport(box, { result: result.reportResult || result, tables: result.reportTables || [], totalOverride: result.reportTotal || null });

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

/** ورودی عددی با جداکنندهٔ سه‌رقمی؛ مقدار محاسباتی بدون جداکننده خوانده می‌شود. */
function numericInput(attrs = {}) {
  const input = h('input', { type: 'text', autocomplete: 'off', ...attrs });
  input.addEventListener('input', () => {
    const raw = normalizeDigits(input.value).replace(/[٬,\s]/g, '').replace(/٫/g, '.');
    const cleaned = raw.replace(/[^\d.]/g, '');
    const dot = cleaned.indexOf('.');
    const normalized = dot < 0 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
    if (!normalized) { input.value = ''; return; }
    const hasDecimal = normalized.endsWith('.');
    const [whole, fraction] = normalized.split('.');
    const grouped = whole ? Number(whole).toLocaleString('fa-IR') : '۰';
    input.value = grouped + (normalized.includes('.') ? '٫' + (fraction || '') : '');
    if (hasDecimal && !input.value.endsWith('٫')) input.value += '٫';
  });
  return input;
}

function numericValue(text) {
  const normalized = normalizeDigits(String(text ?? '')).replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  return normalized.trim() === '' ? NaN : Number(normalized);
}

function delayTool() {
  const principal = numericInput({ min: '1', step: '1', required: '', inputmode: 'numeric' });
  const rate = numericInput({ min: '0', max: '100', step: '0.01', required: '', inputmode: 'decimal' });
  const start = shamsiField('di-start', 'تاریخ سررسید (شمسی)', { required: true });
  const end = shamsiField('di-end', 'تاریخ محاسبه (شمسی)', { required: true });
  const out = h('div', { class: 'tool-out' });
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
      principal: numericValue(principal.value),
      ratePercent: numericValue(rate.value),
      startDate: parseShamsiInput(start.input.value) ?? '',
      endDate: parseShamsiInput(end.input.value) ?? '',
    });
    out.replaceChildren(resultBox(result, form));
  });
  return h('div', { class: 'manual-rate-body' }, [form]);
}


const INDEXED_ERRORS = {
  INVALID_PRINCIPAL: 'اصل دین باید عددی بزرگ‌تر از صفر باشد.',
  INVALID_DATES: 'ماه و سال شروع و پایان را از فهرست‌ها انتخاب کنید.',
  INVALID_PERIOD: 'ماه پایان نمی‌تواند پیش از ماه شروع باشد.',
  NO_INDEX_DATA: 'برای یکی از ماه‌های انتخاب‌شده، شاخص معتبر بانک مرکزی در داده‌های این محاسبه‌گر موجود نیست.',
};

/** فهرست سال‌ها از ۱۳۱۰ آغاز می‌شود؛ ماه‌های فاقد شاخص واقعی قابل انتخاب نیستند. */
const INDEX_COVERAGE = cpiCoverage();
const FIRST_INDEX_YEAR = 1310;
const LAST_INDEX_YEAR = Number(INDEX_COVERAGE.last.slice(0, 4));
const INDEX_YEARS = Array.from(
  { length: LAST_INDEX_YEAR - FIRST_INDEX_YEAR + 1 },
  (_, index) => FIRST_INDEX_YEAR + index,
);
const MONTH_NAMES_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** فهرست‌های سال و ماه؛ فقط دوره‌های داخل پوشش داده برای انتخاب معتبرند. */
function monthFields(idPrefix, labels) {
  const year = h('select', { id: `${idPrefix}-year`, 'aria-label': labels.year }, [
    h('option', { value: '', text: 'انتخاب سال' }),
    ...INDEX_YEARS.map((y) => h('option', { value: String(y), text: faDigits(y) })),
  ]);
  const month = h('select', { id: `${idPrefix}-month`, 'aria-label': labels.month }, [
    h('option', { value: '', text: 'انتخاب ماه' }),
    ...MONTH_NAMES_FA.map((name, i) => h('option', { value: String(i + 1), text: name })),
  ]);
  const yearLabel = h('label', { for: `${idPrefix}-year`, text: labels.year });
  const monthLabel = h('label', { for: `${idPrefix}-month`, text: labels.month });
  const annualInfo = h('p', { class: 'muted', text: '' });
  const refreshMonths = () => {
    const selectedYear = Number(year.value);
    Array.from(month.options).forEach((option) => {
      if (!option.value) return;
      const available = !selectedYear || Boolean(cpiFor(`${selectedYear}-${String(option.value).padStart(2, '0')}`));
      option.disabled = !available;
      if (!available && option.selected) month.value = '';
    });
    const annual = selectedYear ? cpiAnnualFor(selectedYear) : null;
    if (annual) {
      annualInfo.textContent = `شاخص سالانه تاریخی: ${annual.index} (پایه ${annual.base})؛ این عدد برای محاسبه ماهانه خسارت تأخیر تأدیه قابل استفاده نیست.`;
    } else if (selectedYear >= 1310 && selectedYear <= 1314) {
      annualInfo.textContent = 'برای این سال، شاخص تاریخی قابل استناد در منابع بررسی‌شده یافت نشد.';
    } else {
      annualInfo.textContent = '';
    }
  };
  year.addEventListener('change', refreshMonths);
  refreshMonths();
  return {
    nodes: [
      h('div', { class: 'field' }, [yearLabel, year]),
      h('div', { class: 'field' }, [monthLabel, month]),
      annualInfo,
    ],
    iso() {
      const y = Number(year.value);
      const m = Number(month.value);
      if (!y || !m) return '';
      const key = `${y}-${String(m).padStart(2, '0')}`;
      return cpiFor(key) ? (shamsiToIso(y, m, 1) ?? '') : '';
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

/**
 * خسارت تأخیر تأدیه: شاخص سالانهٔ بانک مرکزی که به‌صورت جدول ماهانه منتشر می‌شود.
 * مطابق رأی وحدت رویه ۸۵۰، نسبت شاخص ماه پرداخت به شاخص ماه سررسید/مطالبه ملاک است؛
 * این ابزار روش مستقل «تورم ماهانه» یا میانگین سالانه را اعمال نمی‌کند.
 */
function indexedDelayTool() {
  const cov = cpiCoverage();
  const coverageText = `فهرست سال‌ها از ۱۳۱۰ آغاز می‌شود. شاخص ماهانهٔ قابل استفاده در محاسبه از ${periodLabel(cov.first)} تا ${periodLabel(cov.last)} موجود است. برای سال‌های ۱۳۱۵ تا ۱۳۷۲ فقط شاخص سالانهٔ تاریخی نمایش داده می‌شود و محاسبهٔ ماهانه انجام نمی‌گیرد؛ برای سال‌های ۱۳۱۰ تا ۱۳۱۴ شاخص تاریخی یافت نشده است. آخرین ماه قابل محاسبه: ${periodLabel(cov.last)}.`;
  const coverage = h('div', { class: 'notice', role: 'status', text: coverageText });

  const obligation = h('select', { id: 'dix-obligation' }, [
    h('option', { value: 'money', text: 'وجه نقد و سایر دیون پولی' }),
    h('option', { value: 'cheque', text: 'وجه چک' }),
  ]);
  const startBasis = h('select', { id: 'dix-start-basis' }, [
    h('option', { value: 'demand', text: 'تاریخ مطالبهٔ دین' }),
    h('option', { value: 'due', text: 'تاریخ سررسید؛ در صورت مطالبه در همان تاریخ' }),
  ]);
  const basisWrap = field('dix-start-basis', 'مبنای شروع محاسبه برای دین غیرچکی', startBasis);
  const startFields = monthFields('dix-start', { year: 'سال شروع', month: 'ماه شروع' });
  const endFields = monthFields('dix-end', { year: 'سال پرداخت یا محاسبه', month: 'ماه پرداخت یا محاسبه' });
  const principal = h('input', { type: 'text', id: 'dix-principal', inputmode: 'numeric', autocomplete: 'off', placeholder: 'مثال: ۷۰۰٬۰۰۰٬۰۰۰' });
  principal.addEventListener('input', () => { principal.value = groupAmount(principal.value); });
  const out = h('div', { class: 'tool-out' });

  function syncStartLabels() {
    const isCheque = obligation.value === 'cheque';
    basisWrap.hidden = isCheque;
    startFields.setLabels(isCheque
      ? { year: 'سال سررسید چک', month: 'ماه سررسید چک' }
      : { year: startBasis.value === 'due' ? 'سال سررسید دین' : 'سال مطالبهٔ دین', month: startBasis.value === 'due' ? 'ماه سررسید دین' : 'ماه مطالبهٔ دین' });
  }
  obligation.addEventListener('change', syncStartLabels);
  startBasis.addEventListener('change', syncStartLabels);
  syncStartLabels();

  const form = h('form', { class: 'form dix-form', novalidate: '', 'aria-label': 'محاسبه خسارت تأخیر تأدیه بر اساس شاخص سالانه بانک مرکزی' }, [
    coverage,
    field('dix-obligation', 'نوع دین', obligation),
    basisWrap,
    ...startFields.nodes,
    ...endFields.nodes,
    field('dix-principal', 'مبلغ اصل دین (ریال)', principal),
    h('p', { class: 'muted', text: 'فرمول: مبلغ روزِ پرداخت = اصل دین × شاخص سالانهٔ ماه پرداخت ÷ شاخص سالانهٔ ماه شروع. شاخص سالانه در جدول بانک مرکزی برای هر ماه جداگانه درج می‌شود؛ این به معنای محاسبه با نرخ تورم ماهانه نیست.' }),
    h('p', { class: 'muted', text: 'در دین غیرچکی، تحقق شرایط مادهٔ ۵۲۲ و تاریخ مطالبه باید احراز شود. در چک، مبدأ اصولاً تاریخ سررسید چک است. پرداخت جزئی و محاسبهٔ اقساطی در این نسخه پشتیبانی نمی‌شود.' }),
    h('button', { class: 'btn dix-submit', type: 'submit', text: 'محاسبه خسارت تأخیر تأدیه' }),
    out,
  ]);

  const fail = (message) => out.replaceChildren(h('div', { class: 'notice', role: 'alert', text: message }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const startIso = startFields.iso();
    const endIso = endFields.iso();
    if (!startIso || !endIso) return fail('ماه و سال شروع و پایان باید انتخاب شوند و هر دو باید در محدودهٔ شاخص‌های موجود بانک مرکزی باشند.');
    const amount = parseAmount(principal.value);
    if (!Number.isFinite(amount) || amount <= 0) return fail(INDEXED_ERRORS.INVALID_PRINCIPAL);

    const startLabel = obligation.value === 'cheque'
      ? 'تاریخ سررسید چک'
      : (startBasis.value === 'due' ? 'تاریخ سررسید دین' : 'تاریخ مطالبهٔ دین');
    const r = indexedDelayDamage({
      principal: amount,
      startIso,
      endIso,
      startBasis: startLabel,
      endBasis: 'تاریخ پرداخت یا ماه محاسبه',
    });
    if (!r.ok) {
      if (r.error === 'NO_INDEX_DATA') {
        const periods = (r.outside || []).map((item) => periodLabel(item.periodKey));
        return fail(`برای ${periods.join(' و ')} شاخص معتبر در داده‌های فعلی وجود ندارد؛ عدد تقریبی ساخته نمی‌شود.`);
      }
      return fail(INDEXED_ERRORS[r.error] || 'ورودی‌ها را بررسی کنید.');
    }

    const facts = [
      ['ماه مبنای شروع', r.startIndex.period],
      ['شاخص سالانهٔ ماه شروع', String(r.startIndex.index)],
      ['ماه پرداخت یا محاسبه', r.endIndex.period],
      ['شاخص سالانهٔ ماه پایان', String(r.endIndex.index)],
      ['ضریب تعدیل', r.ratio.toFixed(6)],
      ['اصل دین', formatRial(r.principal)],
    ];
    out.replaceChildren(resultBox({
      ok: true,
      title: 'نتیجهٔ محاسبه بر مبنای شاخص سالانه بانک مرکزی',
      facts,
      interest: r.interest,
      total: r.total,
      steps: r.steps,
      ruleVersion: `رأی وحدت رویه شماره ۸۵۰ مورخ ۱۴۰۳/۰۵/۱۶؛ شاخص‌های بانک مرکزی تا ${periodLabel(r.coverage.last)}`,
      limitations: [
        'مبنای محاسبه، شاخص سالانهٔ بانک مرکزی است که در جدول ماهانه منتشر می‌شود؛ شاخص ماهانهٔ تغییر قیمت یا متوسط شاخص سال تقویمی جایگزین آن نشده است.',
        obligation.value === 'cheque'
          ? 'در خصوص چک، مبدأ محاسبه بر اساس تاریخ سررسید انتخاب شده است؛ شرایط خاص سند و رأی صادره باید بررسی شود.'
          : 'در خصوص سایر دیون پولی، احراز مطالبه، تمکن مدیون، امتناع از پرداخت و سایر شرایط مادهٔ ۵۲۲ بر عهده مرجع رسیدگی است.',
        'پرداخت جزئی، اقساط و تغییر مبلغ اصل دین در طول دوره در این نسخه محاسبه نمی‌شود.',
        `منابع شاخص: ${(r.source.sources || []).map((source) => `${source.publisher}؛ ${source.title}${source.note ? `؛ ${source.note}` : ''}`).join(' | ')}. شاخص ماهانه پیش از ${periodLabel(r.coverage.first)} و پس از ${periodLabel(r.coverage.last)} در این نسخه موجود نیست؛ برای سال‌های ۱۳۱۵ تا ۱۳۷۲ فقط شاخص سالانه تاریخی نمایش داده می‌شود.`,
        'این محاسبه بر مبنای شاخص و فرمول رأی وحدت رویه انجام می‌شود و جایگزین احراز شرایط استحقاق خسارت در پرونده نیست.',
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
  const amount = numericInput({ id: `${title}-amount`, min: '0', step: '1', required: '', inputmode: 'numeric' });
  const countCaption = h('label', { for: `${title}-count`, text: '' });
  const count = numericInput({ id: `${title}-count`, min: '1', step: '1', inputmode: 'numeric' });
  const countWrap = h('div', { class: 'field', hidden: '' }, [countCaption, count]);
  const out = h('div', { class: 'tool-out' });

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
      amount: numericValue(amount.value),
      count: rule.extraInput ? numericValue(count.value) : undefined,
    });
    if (!r.ok && r.error === 'RULE_UNVERIFIED') return out.replaceChildren(unverifiedBox(rule));
    if (!r.ok) return out.replaceChildren(resultBox({ ok: false, error: r.error }, form));
    const approval = rule.status === 'user_approved'
      ? 'این نتیجه بر اساس تأیید کاربر برای استفاده در ماشین‌حساب است؛ احراز رسمی از روزنامهٔ رسمی انجام نشده است.'
      : null;
    const baseAmount = numericValue(amount.value);
    out.replaceChildren(resultBox({
      ok: true,
      title,
      status: rule.status,
      ruleVersion: `${rule.id} / سال ${RATE_YEAR}`,
      steps: r.steps,
      fee: r.fee,
      reportTables: [tierSection(`جدول محاسبهٔ تعرفه: ${rule.title}`, tierTableRows(rule, baseAmount, r.fee), `مستند: ${rule.legal?.citation || ''}`)],
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
/** حق‌الوکاله و تمبر مالیاتی وکیل: فرم مطابق نمونهٔ مرجع. محاسبه در attorney-form.js است؛ این تابع فقط فرم و نمایش را می‌سازد. */
const ATTORNEY_LICENSES = [
  { value: '', text: 'انتخاب کنید (برای سهم‌ها)' },
  { value: 'kanon', text: 'کانون وکلای دادگستری' },
  { value: 'markaz', text: 'مرکز وکلا، کارشناسان رسمی و مشاوران خانواده قوه قضاییه' },
];
const ATTORNEY_CASE_TYPES = [
  { value: 'financial', text: 'مالی' },
  { value: 'family', text: 'امور حسبی، دعاوی خانوادگی و غیرمالی' },
  { value: 'criminal', text: 'کیفری' },
  { value: 'other', text: 'سایر' },
];
// مقدارهای «unsupported» و «dismissOther*» در همین فرم نگاشت می‌شوند؛ «unsupported» قابل انتخاب نیست.
const ATTORNEY_RESULTS = [
  { value: 'none', text: '-' },
  { value: 'dismissBefore', text: 'قرار ابطال دادخواست پیش از پاسخ به دعوا و دفاع از آن' },
  { value: 'unsupported', text: 'قرار ابطال دادخواست پس از پاسخ به دعوا و دفاع از آن (این عنوان در متن تعرفه نیامده؛ محاسبه انجام نمی‌شود)', disabled: true },
  { value: 'appealBefore', text: 'قرار سقوط دعوای تجدیدنظر قبل از پاسخ و دفاع از دعوا' },
  { value: 'appealAfter', text: 'قرار سقوط دعوای تجدیدنظر پس از پاسخ و دفاع از دعوا' },
  { value: 'dismissOtherA', text: 'قرار رد دعوا به علت قبول ایراد مرور زمان' },
  { value: 'dismissOtherB', text: 'قرار رد تقاضای اعاده دادرسی' },
  { value: 'dismissOtherC', text: 'قرار رد دعوا به علت اعتبار امر مختومه' },
  { value: 'dismissAfter', text: 'قرار رد دادخواست پس از پاسخ به دعوا و دفاع از آن (ماده ۱۲ بند ب)' },
  { value: 'interlocutory', text: 'اعتراض به قرارهای حقوقی قابل اعتراض (بازه‌ای)' },
];
const RESULT_KEY = { dismissOtherA: 'dismissOther', dismissOtherB: 'dismissOther', dismissOtherC: 'dismissOther' };

/** ردیف‌های تمبر مالیاتی و سهم‌ها برای نمایش و گزارش؛ بدون پروانه، فقط تمبر و یادداشت انتخاب پروانه. */
function stampRowsOf(stamp, title = '') {
  if (!stamp?.ok) return [];
  const rows = [
    ['مبنای تمبر و سهم مرکز', `${formatRial(stamp.stampBase)}؛ ${stamp.basisLabel}`],
    ['تمبر مالیاتی (۵٪ مبنا)', formatRial(stamp.stamp)],
  ];
  if (!stamp.shares.length) rows.push(['سهم کانون، صندوق یا مرکز', 'نوع پروانه را انتخاب کنید']);
  stamp.shares.forEach((s) => rows.push([s.label, formatRial(s.amount)]));
  return title ? rows.map(([a, b]) => [`${title} — ${a}`, b]) : rows;
}

/** ردیف‌های تمبر: یک‌مرحله‌ای یا جدا برای بدوی و تجدیدنظر (ماده ۲۱) با جمع تمبر. */
function stampRowsFor(r) {
  if (!r.stages) return stampRowsOf(r.stamp);
  const rows = r.stages.flatMap((s) => stampRowsOf(s.stamp, s.label));
  const totalStamp = r.stages.reduce((sum, s) => sum + (s.stamp?.stamp || 0), 0);
  rows.push(['جمع تمبر مالیاتی دو مرحله', formatRial(totalStamp)]);
  return rows;
}

/** خروجی ساده: حق‌الوکاله و تمبر به‌تفکیک مرحله و جمع؛ سهم‌ها خلاصه؛ جزئیات جمع‌شونده. */
function attorneyResultBox(r, form) {
  const stamps = r.stages ? r.stages.map((s) => s.stamp) : [r.stamp];
  const stampOf = (st) => (st?.ok ? st.stamp : 0);
  const summary = [['حق‌الوکاله کل', formatRial(r.feeTotal)]];
  if (r.stages) {
    summary.push(['حق‌الوکاله مرحلهٔ بدوی (۶۰٪)', formatRial(r.stages[0].fee)], ['حق‌الوکاله مرحلهٔ تجدیدنظر (۴۰٪)', formatRial(r.stages[1].fee)]);
    summary.push(['تمبر مالیاتی مرحلهٔ بدوی', formatRial(stampOf(stamps[0]))], ['تمبر مالیاتی مرحلهٔ تجدیدنظر', formatRial(stampOf(stamps[1]))]);
  }
  summary.push(['جمع کل تمبر مالیاتی', formatRial(stamps.reduce((sum, st) => sum + stampOf(st), 0))]);
  if (r.travelTotal > 0) summary.push(['فوق‌العاده مأموریت (جدا از حق‌الوکاله)', formatRial(r.travelTotal)]);

  const shareTotals = new Map();
  for (const st of stamps) {
    for (const s of st?.shares || []) {
      const name = s.label.includes('صندوق') ? 'صندوق حمایت وکلا' : (s.label.includes('کانون') ? 'کانون وکلای دادگستری' : 'مرکز وکلا');
      shareTotals.set(name, (shareTotals.get(name) || 0) + s.amount);
    }
  }
  const shareRows = shareTotals.size
    ? [...shareTotals].map(([k, v]) => [k, formatRial(v)])
    : [['سهم کانون، صندوق یا مرکز', 'نوع پروانه را انتخاب کنید']];

  const dl = (rows) => h('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
  const box = h('div', { class: 'result', role: 'status', 'aria-live': 'polite' }, [
    h('div', { class: 'result-head' }, [h('h3', { text: 'حق‌الوکاله و تمبر مالیاتی' })]),
    dl(summary),
    h('h4', { text: 'سهم‌ها' }),
    dl(shareRows),
  ]);
  box.append(h('details', { class: 'attorney-details' }, [
    h('summary', { text: 'جزئیات محاسبه' }),
    dl([...r.lines.map((l) => [l.label, formatRial(l.amount)]), ...stampRowsFor(r)]),
  ]));
  registerReport(box, { result: { ok: true, fee: r.total, facts: [...summary, ...shareRows] }, tables: [] });

  if (form) {
    const again = h('button', { class: 'btn small secondary', type: 'button', text: 'محاسبه مجدد' });
    again.addEventListener('click', () => form.requestSubmit());
    const edit = h('button', { class: 'btn small secondary', type: 'button', text: 'ویرایش ورودی‌ها' });
    edit.addEventListener('click', () => form.querySelector('input, select, textarea')?.focus());
    box.append(h('div', { class: 'row result-actions' }, [again, edit]));
  }
  return box;
}

function attorneyTool(id) {
  const license = h('select', { id: 'att-license' }, ATTORNEY_LICENSES.map((o) => h('option', { value: o.value, text: o.text })));
  const agreed = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'اختیاری؛ به ریال' });
  agreed.addEventListener('input', () => { agreed.value = groupAmount(agreed.value); });
  const received = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'اختیاری؛ به ریال' });
  received.addEventListener('input', () => { received.value = groupAmount(received.value); });
  const caseType = h('select', { id: 'att-case' }, ATTORNEY_CASE_TYPES.map((o) => h('option', { value: o.value, text: o.text })));
  const judgment = h('select', { id: 'att-judgment' }, [
    h('option', { value: '', text: 'انتخاب کنید' }),
    h('option', { value: 'nonfinal', text: 'حکم غیرقطعی (ماده ۹ بندهای الف تا ث)' }),
    h('option', { value: 'final', text: 'حکم قطعی از حیث بهای خواسته (ماده ۹، ۱۰٪)' }),
  ]);
  const judgmentWrap = field('att-judgment', 'نوع حکم (برای دعوای مالی)', judgment);
  const result = h('select', { id: 'att-result' }, ATTORNEY_RESULTS.map((o) => {
    const opt = h('option', { value: o.value, text: o.text });
    if (o.disabled) opt.disabled = true;
    return opt;
  }));
  const specialty = h('select', { id: 'att-specialty' }, [
    h('option', { value: 'no', text: 'وکیل گواهی وکالت تخصصی ندارد.' }),
    h('option', { value: 'yes', text: 'وکیل گواهی وکالت تخصصی از کانون یا مرکز وکلا دارد.' }),
  ]);
  const inDays = numericInput({ inputmode: 'numeric', placeholder: 'مثال: ۵' });
  const outDays = numericInput({ inputmode: 'numeric', placeholder: 'مثال: ۳' });
  const afterReversal = h('input', { type: 'checkbox', id: 'att-reversal' });
  const temporary = h('input', { type: 'checkbox', id: 'att-temporary' });
  const amount = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '۱٬۰۰۰٬۰۰۰ معادل ۱۰۰ هزار تومان' });
  amount.addEventListener('input', () => { amount.value = groupAmount(amount.value); });
  const out = h('div', { class: 'tool-out' });

  function sync() {
    judgmentWrap.hidden = caseType.value !== 'financial';
  }
  caseType.addEventListener('change', sync);
  result.addEventListener('change', sync);
  sync();

  const form = h('form', { class: 'form dix-form', novalidate: '', 'aria-label': 'حق‌الوکاله و تمبر مالیاتی وکیل' }, [
    field('att-license', 'نوع پروانه وکیل (برای سهم کانون، صندوق یا مرکز)', license),
    field('att-case', 'نوع دعوا', caseType),
    judgmentWrap,
    field('att-result', 'نتیجهٔ ختم دعوا', result),
    field('att-specialty', 'گواهی وکالت تخصصی وکیل', specialty),
    field('att-in-days', 'تعداد روزهای ماموریت داخل استان', inDays),
    field('att-out-days', 'تعداد روزهای ماموریت خارج استان', outDays),
    h('label', { class: 'check-row' }, [afterReversal, h('span', { text: 'قبول وکالت پس از نقض رای' })]),
    h('label', { class: 'check-row' }, [temporary, h('span', { text: 'وکیل تسخیری یا معاضدتی' })]),
    field('att-amount', 'بهای خواسته یا محکوم به (ریال)', amount),
    field('att-agreed', 'حق‌الوکالهٔ درج‌شده در وکالت‌نامه (ریال، اختیاری)', agreed),
    field('att-received', 'مبلغ علی‌الحساب واقعاً دریافت‌شده از موکل (ریال، اختیاری)', received),
    h('button', { class: 'btn dix-submit', type: 'submit', text: 'محاسبه' }),
    out,
  ]);

  function showNotice(text) {
    out.replaceChildren(h('div', { class: 'notice', role: 'alert', text }));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const days = (text) => {
      const t = normalizeDigits(text).replace(/[٬,\s]/g, '').trim();
      if (t === '') return 0;
      return /^\d+$/.test(t) ? Number(t) : NaN;
    };
    const inP = days(inDays.value);
    const outP = days(outDays.value);
    if (Number.isNaN(inP) || Number.isNaN(outP)) return showNotice(INPUT_MESSAGES.INVALID_UNITS);
    const resultKey = RESULT_KEY[result.value] || result.value;
    const r = computeAttorneyForm({
      subject: 'attorney',
      license: license.value,
      agreedFee: parseAmount(agreed.value) || 0,
      received: parseAmount(received.value) || 0,
      caseType: caseType.value,
      judgment: judgment.value,
      amount: parseAmount(amount.value),
      result: resultKey,
      afterReversal: afterReversal.checked,
      specialty: specialty.value === 'yes',
      inProvinceDays: inP,
      outProvinceDays: outP,
      temporary: temporary.checked,
    });
    if (!r.ok) {
      if (r.error === 'RANGE_ONLY') {
        const items = (r.ranges || []).flatMap((g) => {
          const main = h('li', { text: `${g.title.replace(/\s*\([^)]*ماده[^)]*\)/g, "")}: از ${formatRial(g.min)} تا ${formatRial(g.max)}` });
          if (!g.stages) return [main];
          const s = (k, label) => h('li', { text: `${label} (${g.stages[k].percent}٪): از ${formatRial(g.stages[k].min)} تا ${formatRial(g.stages[k].max)}` });
          return [main, s('first', 'مرحلهٔ بدوی'), s('appeal', 'مرحلهٔ تجدیدنظر')];
        });
        out.replaceChildren(h('div', {}, [
          h('div', { class: 'notice', role: 'alert', text: r.message }),
          h('ul', { class: 'muted' }, items),
        ]));
        return;
      }
      return showNotice(r.message || 'ورودی‌ها را بررسی کنید.');
    }
    out.replaceChildren(attorneyResultBox(r, form));
  });

  return h('section', { class: 'tool', id }, [
    h('h2', { text: 'حق‌الوکاله و تمبر مالیاتی وکیل طبق تعرفه' }),
    h('p', { class: 'muted', text: 'این عدد طبق تعرفهٔ حق‌الوکاله محاسبه می‌شود؛ حق‌الوکالهٔ توافقی جداگانه تعیین می‌شود.' }),
    form,
  ]);
}

const TOOL_PAGES = {
  regional: {
    title: 'ارزش منطقه‌ای املاک',
    intro: 'محاسبه ارزش معاملاتی عرصه و اعیانی بر اساس بلوک‌های رسمی شیراز و تهران و جداول سال ۱۴۰۵.',
    build: () => regionalValueTool(),
  },
  court: {
    title: 'هزینهٔ دادرسی',
    intro: 'محاسبهٔ هزینهٔ دادرسی بر اساس مبنای خواسته یا محکوم‌به و پله‌های قانونی.',
    build: () => ruleTool({
      title: 'هزینهٔ دادرسی',
      amountLabel: 'مبلغ مبنا (ریال)',
      group: 'court',
      submitLabel: 'محاسبه هزینهٔ دادرسی',
      note: ['مبنای محاسبه (خواسته یا محکوم‌به) و نحوهٔ اعمال هر پله باید مطابق متن رسمی باشد.', 'این ابزار پیش‌نویس است و پیش از ثبت دادخواست باید بازبینی شود.'],    }),
  },
  attorney: {
    title: 'حق‌الوکاله و تمبر طبق تعرفه',
    intro: 'محاسبهٔ حق‌الوکالهٔ قانونی وکیل بر اساس آیین‌نامه تعرفه ۱۳۹۸ (فایل تعرفه).',
    build: () => attorneyTool('calc-attorney'),
  },
  delay: {
    title: 'خسارت تأخیر تأدیه',
    intro: 'محاسبهٔ خسارت تأخیر تأدیه بر اساس جدول شاخص ماهانهٔ بانک مرکزی (ماده ۵۲۲ قانون آیین دادرسی مدنی).',
    build: () => h('section', { class: 'tool', id: 'calc-delay' }, [
      h('h2', { text: 'خسارت تأخیر تأدیه بر اساس شاخص بانک مرکزی' }),
      h('p', { class: 'muted', text: 'روش اصلی: خسارت از جدول شاخص ماهانهٔ بانک مرکزی محاسبه می‌شود. برای این روش نرخ سالانه وارد نمی‌کنید.' }),
      indexedDelayTool(),
      h('details', { class: 'manual-rate' }, [
        h('summary', { text: 'روش فرعی: نرخ سالانهٔ دستی (فقط وقتی نرخ مشخص و مستند دارید)' }),
        h('p', { class: 'muted', text: 'این روش جداگانه است و با جدول شاخص بانک مرکزی ترکیب نمی‌شود. نرخ را فقط از منبع رسمی و مستند وارد کنید.' }),
        delayTool(),
      ]),
    ]),
  },
};

const CALC_NOTICE = 'این ابزارها پیش‌نویس محاسباتی هستند و جای تشخیص وکیل را نمی‌گیرند. قواعد هر ابزار و منبع آن در همان بخش نشان داده می‌شود. تاریخ‌ها شمسی وارد می‌شوند.';

/** نوار ابزار هر ابزار: چاپ یا ذخیرهٔ گزارش، و پاک‌کردن ورودی‌ها و نتیجه. */
function toolToolbar(section) {
  const print = h('button', { type: 'button', class: 'btn secondary', text: 'چاپ یا ذخیرهٔ گزارش A4' });
  print.addEventListener('click', () => {
    const result = section.querySelector('.regional-result, .tool-out .result');
    if (!result) {
      const notice = section.querySelector('.tool-out .notice');
      if (notice) notice.focus?.();
      return;
    }
    const rows = Array.from(section.querySelectorAll('form input, form select, form textarea'))
      .filter((control) => {
        if (['submit', 'button', 'reset', 'hidden'].includes(control.type)) return false;
        if (control.closest('[hidden]') || control.closest('details:not([open])') || control.disabled) return false;
        // For radio groups, report the chosen option once; unchecked checkboxes
        // are meaningful inputs and must be printed explicitly as "خیر".
        if (control.type === 'radio' && !control.checked) return false;
        return true;
      })
      .map((control) => {
        const wrapper = control.closest('.field');
        const label = control.labels?.[0]?.textContent?.trim()
          || wrapper?.querySelector('label')?.textContent?.trim()
          || control.getAttribute('aria-label')
          || control.name || control.id || 'مشخصات';
        let value;
        if (control.type === 'checkbox') value = control.checked ? 'بله؛ انتخاب شده' : 'خیر؛ انتخاب نشده';
        else if (control.type === 'radio') value = control.checked ? (control.labels?.[0]?.textContent?.trim() || control.value || 'انتخاب شده') : '';
        else if (control.tagName === 'SELECT') {
          value = control.multiple
            ? Array.from(control.selectedOptions).map((option) => option.textContent.trim()).join('، ')
            : control.selectedOptions?.[0]?.textContent?.trim();
        } else value = String(control.value ?? '').trim() || 'وارد نشده';
        return [label, value || 'وارد نشده'];
      });
    const title = section.querySelector(':scope > h2')?.textContent || section.querySelector('h2')?.textContent || 'گزارش محاسبات حقوقی';
    const builder = getReportBuilder(result);
    const model = builder ? buildFormModel({ title, inputs: rows, ...builder }) : null;
    createA4TextReport({ title, rows, content: result, filename: 'gozaresh-hesabgar', model });
  });
  const clear = h('button', { type: 'button', class: 'btn secondary', text: 'پاک‌کردن ورودی‌ها و نتیجه' });
  clear.addEventListener('click', () => {
    section.querySelectorAll('form').forEach((f) => f.reset());
    section.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea').forEach((el) => { el.value = ''; });
    section.querySelectorAll('select').forEach((el) => { el.selectedIndex = 0; });
    section.querySelectorAll('.tool-out').forEach((o) => o.replaceChildren());
  });
  return h('div', { class: 'row tool-toolbar' }, [print, clear]);
}

const TOOL_VISUALS = {
  regional: { icon: 'map-pin', eyebrow: 'ارزش معاملاتی املاک', accent: 'blue', short: 'ارزش عرصه و اعیانی بر اساس بلوک رسمی شهر' },
  court: { icon: 'landmark', eyebrow: 'هزینه‌ها و دادرسی', accent: 'teal', short: 'برآورد هزینه‌های قانونی طرح دعوا' },
  attorney: { icon: 'briefcase', eyebrow: 'تعرفه وکالت', accent: 'gold', short: 'محاسبه تعرفه و فوق‌العاده‌های وکیل' },
  delay: { icon: 'chart', eyebrow: 'دین و تعهدات', accent: 'blue', short: 'محاسبه خسارت بر پایه شاخص‌های ماهانه' },
};

function calculatorStyles() {
  if (document.querySelector('link[data-calculator-styles]')) return;
  const link = h('link', { rel: 'stylesheet', href: 'css/calculators.css?v=20261119-text-a4' });
  link.setAttribute('data-calculator-styles', 'true');
  document.head.append(link);
}

/** صفحهٔ مستقل هر محاسبه‌گر با مسیر خودش. */
function toolPage(kind) {
  const tool = TOOL_PAGES[kind];
  const visual = TOOL_VISUALS[kind];
  const section = tool.build();
  // Some legacy/global page styles can collapse nested tool sections. Keep the
  // actual calculator workspace mounted and visible on its dedicated route.
  section.hidden = false;
  section.removeAttribute('hidden');
  section.classList.add('calculator-workspace');
  section.style.setProperty('display', 'block', 'important');
  section.style.setProperty('visibility', 'visible', 'important');
  section.querySelectorAll('form, .field, input, select, button, .tool-out').forEach((node) => {
    node.hidden = false;
    node.style.removeProperty('display');
    node.style.removeProperty('visibility');
  });
  const hero = h('section', { class: `calculator-detail-hero accent-${visual.accent}` }, [
    h('div', { class: 'calculator-hero-symbol', 'aria-hidden': 'true' }, [icon(visual.icon, { size: 34 })]),
    h('div', { class: 'calculator-hero-copy' }, [
      h('span', { class: 'calculator-eyebrow', text: visual.eyebrow }),
      h('h1', { text: tool.title }),
      h('p', { text: tool.intro }),
    ]),
    h('span', { class: 'calculator-hero-mark', 'aria-hidden': 'true' }, [icon('calculator', { size: 72 })]),
  ]);
  const guidance = h('div', { class: 'calculator-guidance' }, [
    icon('info', { size: 18 }),
    h('span', { text: CALC_NOTICE }),
  ]);
  return h('div', { class: 'calculators-page calculator-detail-page' }, [
    h('a', { class: 'calculator-back', href: '#/calculators' }, [icon('arrow-right', { size: 17 }), h('span', { text: 'بازگشت به همهٔ محاسبه‌گرها' })]),
    hero,
    guidance,
    section,
    h('div', { class: 'calculator-actions calculator-actions-bottom' }, [toolToolbar(section)]),
  ]);
}

function calculatorCard(key, tool) {
  const visual = TOOL_VISUALS[key];
  return h('a', { class: `calculator-card accent-${visual.accent}`, href: `#/calculators/${key}`, 'aria-label': `ورود به ${tool.title}` }, [
    h('div', { class: 'calculator-card-top' }, [
      h('span', { class: 'calculator-card-icon', 'aria-hidden': 'true' }, [icon(visual.icon, { size: 27 })]),
      h('span', { class: 'calculator-card-arrow', 'aria-hidden': 'true' }, [icon('arrow-up-left', { size: 18 })]),
    ]),
    h('span', { class: 'calculator-eyebrow', text: visual.eyebrow }),
    h('h2', { text: tool.title }),
    h('p', { text: tool.intro }),
    h('span', { class: 'calculator-card-footer' }, [
      h('span', { text: 'ورود به محاسبه‌گر' }),
      icon('arrow-left', { size: 17 }),
    ]),
  ]);
}

export function calculatorsPage(params = {}) {
  calculatorStyles();
  if (params.tool && TOOL_PAGES[params.tool]) return toolPage(params.tool);
  const entries = Object.entries(TOOL_PAGES);
  const search = h('input', { type: 'search', class: 'calculator-search-input', placeholder: 'جست‌وجوی محاسبه‌گر…', 'aria-label': 'جست‌وجو در محاسبه‌گرها' });
  const cards = h('div', { class: 'calculator-grid' }, entries.map(([key, tool]) => calculatorCard(key, tool)));
  const count = h('span', { class: 'calculator-count', text: `${entries.length} ابزار کاربردی` });
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('fa');
    let visible = 0;
    for (const card of cards.children) {
      const match = card.textContent.toLocaleLowerCase('fa').includes(query);
      card.hidden = !match;
      if (match) visible++;
    }
    count.textContent = `${visible} محاسبه‌گر`;
  });
  return h('div', { class: 'calculators-page' }, [
    h('section', { class: 'calculators-hero' }, [
      h('div', { class: 'calculators-hero-copy' }, [
        h('span', { class: 'calculator-eyebrow' }, [icon('scale', { size: 15 }), h('span', { text: 'ابزارهای حرفه‌ای حقوقی' })]),
        h('h1', { text: 'محاسبه‌گرهای حقوقی' }),
        h('p', { text: 'محاسبات حقوقی پرکاربرد را سریع، روشن و مرحله‌به‌مرحله انجام دهید.' }),
        h('div', { class: 'calculators-hero-meta' }, [icon('shield-check', { size: 17 }), h('span', { text: 'با نمایش مبنا، جزئیات و محدودیت‌های هر محاسبه' })]),
      ]),
      h('div', { class: 'calculators-hero-art', 'aria-hidden': 'true' }, [
        h('div', { class: 'calculator-art-orbit orbit-one' }),
        h('div', { class: 'calculator-art-orbit orbit-two' }),
        h('div', { class: 'calculator-art-core' }, [icon('calculator', { size: 66 })]),
        h('span', { class: 'calculator-art-mini mini-one' }, [icon('scale', { size: 24 })]),
        h('span', { class: 'calculator-art-mini mini-two' }, [icon('file-text', { size: 23 })]),
      ]),
    ]),
    h('div', { class: 'calculator-list-heading' }, [
      h('div', {}, [h('h2', { text: 'ابزار موردنظر را انتخاب کنید' }), h('p', { class: 'muted', text: 'هر محاسبه‌گر صفحه و راهنمای اختصاصی خود را دارد.' })]),
      count,
    ]),
    h('div', { class: 'calculator-search' }, [icon('search', { size: 19 }), search]),
    cards,
    h('div', { class: 'calculator-disclaimer' }, [icon('info', { size: 19 }), h('p', { text: CALC_NOTICE })]),
  ]);
}