// صفحهٔ محاسبه‌گرها. فرم‌ها با DOM امن ساخته می‌شوند؛ خروجی فقط متن است.
import { deadline, delayInterest } from './core.js';
import { formatShamsi } from '../shamsi.js';

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
    return h('div', { class: 'notice', role: 'alert', text: 'ورودی‌ها را بررسی کنید؛ تاریخ‌ها و مبلغ باید معتبر باشند.' });
  }
  const box = h('div', { class: 'result', role: 'status', 'aria-live': 'polite' });
  box.append(h('h3', { text: 'نتیجه' }));
  for (const line of result.steps) box.append(h('p', { text: line }));
  if (result.lastDay) {
    box.append(h('p', { class: 'lead', text: `آخرین روز: ${formatShamsi(new Date(result.lastDay + 'T12:00:00Z'))}` }));
  }
  if (typeof result.interest === 'number') {
    box.append(h('p', { class: 'lead', text: `خسارت: ${result.interest.toLocaleString('fa-IR')} (جمع با اصل: ${result.total.toLocaleString('fa-IR')})` }));
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
  const notice = h('input', { type: 'date', required: '' });
  const days = h('input', { type: 'number', min: '0', max: '3650', step: '1', required: '', inputmode: 'numeric' });
  const out = h('div');
  const submit = h('button', { class: 'btn', type: 'submit', text: 'محاسبه مهلت' });
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'محاسبه مواعد' }, [
    field('dl-notice', 'تاریخ ابلاغ', notice),
    field('dl-days', 'مدت مهلت (روز)', days),
    submit,
    out,
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = deadline({ noticeDate: notice.value, days: Number(days.value) });
    out.replaceChildren(resultBox(result));
  });
  return h('section', { class: 'tool' }, [h('h2', { text: 'محاسبه مواعد قانونی' }), form]);
}

function delayTool() {
  const principal = h('input', { type: 'number', min: '1', step: '1', required: '', inputmode: 'numeric' });
  const rate = h('input', { type: 'number', min: '0', max: '100', step: '0.01', required: '', inputmode: 'decimal' });
  const start = h('input', { type: 'date', required: '' });
  const end = h('input', { type: 'date', required: '' });
  const out = h('div');
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'محاسبه خسارت تأخیر تأدیه' }, [
    field('di-principal', 'مبلغ اصل دین (ریال)', principal),
    field('di-rate', 'نرخ سالانه (٪) — از منبع رسمی وارد کنید', rate),
    field('di-start', 'تاریخ سررسید', start),
    field('di-end', 'تاریخ محاسبه', end),
    h('button', { class: 'btn', type: 'submit', text: 'محاسبه خسارت' }),
    out,
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = delayInterest({
      principal: Number(principal.value),
      ratePercent: Number(rate.value),
      startDate: start.value,
      endDate: end.value,
    });
    out.replaceChildren(resultBox(result));
  });
  return h('section', { class: 'tool' }, [h('h2', { text: 'خسارت تأخیر تأدیه (روش ساده)' }), form]);
}

export function calculatorsPage() {
  return h('div', {}, [
    h('h1', { text: 'محاسبه‌گرهای حقوقی' }),
    h('div', {
      class: 'notice',
      role: 'note',
      text: 'این ابزارها پیش‌نویس محاسباتی هستند و جای تشخیص وکیل را نمی‌گیرند. نرخ‌های قانونی هنوز از منبع رسمی تأیید نشده‌اند؛ نرخ‌ها را خودتان وارد می‌کنید.',
    }),
    deadlineTool(),
    delayTool(),
  ]);
}
