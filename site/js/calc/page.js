// صفحهٔ محاسبه‌گرها. فرم‌ها با DOM امن ساخته می‌شوند؛ خروجی فقط متن است. تاریخ‌ها شمسی وارد می‌شوند.
import { deadline, delayInterest, courtFee, attorneyFee } from './core.js';
import { formatShamsi } from '../shamsi.js';
import { parseShamsiInput, isoToShamsiInput } from '../jalali.js';
import { shamsiField } from '../shamsi-field.js';

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

function resultBox(result) {
  if (!result.ok) {
    return h('div', { class: 'notice', role: 'alert', text: 'ورودی‌ها را بررسی کنید؛ تاریخ‌ها باید شمسی و معتبر باشند (مثال: ۱۴۰۵/۰۸/۰۶) و مبالغ و نرخ‌ها عددی باشند.' });
  }
  const box = h('div', { class: 'result', role: 'status', 'aria-live': 'polite' });
  box.append(h('h3', { text: 'نتیجه' }));
  // تاریخ‌های میلادی داخل مراحل را برای کاربر شمسی نشان می‌دهیم.
  const shamsiLine = (line) => line.replace(/\d{4}-\d{2}-\d{2}/g, (iso) => isoToShamsiInput(iso));
  for (const line of result.steps) box.append(h('p', { text: shamsiLine(line) }));
  if (result.lastDay) {
    box.append(h('p', { class: 'lead', text: `آخرین روز: ${formatShamsi(new Date(result.lastDay + 'T12:00:00Z'))}` }));
  }
  if (typeof result.interest === 'number') {
    box.append(h('p', { class: 'lead', text: `خسارت: ${result.interest.toLocaleString('fa-IR')} (جمع با اصل: ${result.total.toLocaleString('fa-IR')})` }));
  }
  if (typeof result.fee === 'number') {
    box.append(h('p', { class: 'lead', text: `مبلغ: ${result.fee.toLocaleString('fa-IR')} ریال` }));
  }
  box.append(h('h4', { text: 'محدودیت‌ها' }));
  const ul = h('ul');
  for (const item of result.limitations) ul.append(h('li', { text: item }));
  box.append(ul);
  box.append(h('p', { class: 'muted', text: `نسخهٔ قاعده: ${result.ruleVersion}` }));
  return box;
}

function field(id, label, input) {
  input.id = id;
  return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input]);
}

function deadlineTool() {
  const notice = shamsiField('dl-notice', 'تاریخ ابلاغ (شمسی)', { required: true });
  const days = h('input', { type: 'number', min: '0', max: '3650', step: '1', required: '', inputmode: 'numeric' });
  const out = h('div');
  const submit = h('button', { class: 'btn', type: 'submit', text: 'محاسبه مهلت' });
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'محاسبه مواعد' }, [
    notice.node,
    field('dl-days', 'مدت مهلت (روز)', days),
    submit,
    out,
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const noticeDate = parseShamsiInput(notice.input.value) ?? '';
    const result = deadline({ noticeDate, days: Number(days.value) });
    out.replaceChildren(resultBox(result));
  });
  return h('section', { class: 'tool' }, [h('h2', { text: 'محاسبه مواعد قانونی' }), form]);
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
      principal: Number(principal.value),
      ratePercent: Number(rate.value),
      startDate: parseShamsiInput(start.input.value) ?? '',
      endDate: parseShamsiInput(end.input.value) ?? '',
    });
    out.replaceChildren(resultBox(result));
  });
  return h('section', { class: 'tool' }, [h('h2', { text: 'خسارت تأخیر تأدیه (روش ساده)' }), form]);
}

/** هزینهٔ دادرسی و حق‌الوکاله: فرمول «درصد با کف و سقف»؛ نرخ‌ها را کاربر از آیین‌نامهٔ معتبر وارد می‌کند. */
function percentTool({ title, amountLabel, submitLabel, run }) {
  const amount = h('input', { type: 'number', min: '0', step: '1', required: '', inputmode: 'numeric' });
  const percent = h('input', { type: 'number', min: '0', max: '100', step: '0.01', required: '', inputmode: 'decimal' });
  const min = h('input', { type: 'number', min: '0', step: '1', value: '0', inputmode: 'numeric' });
  const max = h('input', { type: 'number', min: '0', step: '1', placeholder: 'خالی = بدون سقف', inputmode: 'numeric' });
  const out = h('div');
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': title }, [
    field(`${title}-amount`, amountLabel, amount),
    field(`${title}-percent`, 'نرخ (٪) — از آیین‌نامهٔ معتبر وارد کنید', percent),
    field(`${title}-min`, 'کف (ریال، اختیاری)', min),
    field(`${title}-max`, 'سقف (ریال، اختیاری)', max),
    h('button', { class: 'btn', type: 'submit', text: submitLabel }),
    out,
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = run({
      amount: Number(amount.value),
      percent: Number(percent.value),
      min: min.value === '' ? 0 : Number(min.value),
      max: max.value === '' ? null : Number(max.value),
    });
    out.replaceChildren(resultBox(result));
  });
  return h('section', { class: 'tool' }, [h('h2', { text: title }), form]);
}

export function calculatorsPage() {
  return h('div', {}, [
    h('h1', { text: 'محاسبه‌گرهای حقوقی' }),
    h('div', {
      class: 'notice',
      role: 'note',
      text: 'این ابزارها پیش‌نویس محاسباتی هستند و جای تشخیص وکیل را نمی‌گیرند. نرخ‌ها، کف و سقف‌ها را خودتان از منبع رسمی و معتبر وارد می‌کنید؛ این نسخه هیچ نرخ قانونی را از پیش نمی‌داند. تاریخ‌ها شمسی وارد می‌شوند.',
    }),
    deadlineTool(),
    percentTool({
      title: 'هزینهٔ دادرسی',
      amountLabel: 'مبلغ خواسته (ریال)',
      submitLabel: 'محاسبه هزینهٔ دادرسی',
      run: ({ amount, percent, min, max }) => courtFee({ claimAmount: amount, percent, min, max }),
    }),
    percentTool({
      title: 'حق‌الوکاله',
      amountLabel: 'مبلغ مبنا (ریال)',
      submitLabel: 'محاسبه حق‌الوکاله',
      run: ({ amount, percent, min, max }) => attorneyFee({ amount, percent, min, max }),
    }),
    delayTool(),
  ]);
}
