// گردش کار مرحله‌ای تکمیل اطلاعات و خروجی سند حقوقی
const COURT_DOCS = new Set([
  'petition','defense','appeal','cassation','enforcement','criminal_complaint','reply',
  'retrial','third_party','opposition','counterclaim','execution_objection','jurisdiction',
  'evidence_request','judicial_request'
]);

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function getDocumentFields(docType) {
  const contract = docType === 'contract';
  const criminal = docType === 'criminal_complaint';
  const first = contract ? 'طرف اول' : criminal ? 'شاکی' : 'شخص اول';
  const second = contract ? 'طرف دوم' : criminal ? 'مشتکی‌عنه' : 'شخص دوم';
  const fields = [
    { key: 'partyOneName', label: `نام و نام خانوادگی ${first}`, required: false, kind: 'text' },
    { key: 'partyOneAddress', label: `نشانی ${first}`, required: false, kind: 'textarea' },
    { key: 'partyTwoName', label: `نام و نام خانوادگی ${second}`, required: false, kind: 'text' },
    { key: 'partyTwoAddress', label: `نشانی ${second}`, required: false, kind: 'textarea' },
  ];
  if (COURT_DOCS.has(docType)) {
    fields.push(
      { key: 'court', label: 'نام مرجع قضایی یا شعبه، در صورت اطلاع', required: false, kind: 'text' },
      { key: 'caseNumber', label: 'شماره پرونده یا بایگانی، در صورت وجود', required: false, kind: 'text' },
      { key: 'caseStage', label: 'مرحله فعلی رسیدگی، اگر در مشاوره روشن نشده است', required: false, kind: 'textarea' },
    );
  }
  fields.push({ key: 'additionalDetails', label: 'اطلاعات تکمیلی ضروری که در مشاوره گفته نشده است', required: false, kind: 'textarea' });
  return fields;
}

/**
 * Each step asks for one field. Optional fields can be skipped. Previously discussed
 * case facts are deliberately not requested again; only identity/filing metadata is collected.
 */
export function createDocumentWizard({ docType, onComplete, onCancel }) {
  const fields = getDocumentFields(docType);
  const values = {};
  let index = 0;
  const root = node('section', 'ai-document-wizard ai-party-panel');
  const heading = node('h3', '', 'تکمیل مرحله‌ای اطلاعات سند');
  const intro = node('p', 'muted', 'هر بار فقط یک مورد نمایش داده می‌شود. اطلاعات ماهوی پرونده از گفت‌وگوی مشاوره استخراج می‌شود؛ مواردی را که قبلاً گفته‌اید دوباره وارد نکنید. فیلدهای غیرضروری قابل رد کردن هستند.');
  const progress = node('p', 'muted ai-wizard-progress');
  const label = node('label', 'ai-party-field');
  const controlWrap = node('div', 'ai-wizard-control');
  const actions = node('div', 'ai-wizard-actions');
  const back = node('button', 'btn secondary', 'مرحله قبل');
  back.type = 'button';
  const next = node('button', 'btn', 'مرحله بعد');
  next.type = 'button';
  const cancel = node('button', 'btn secondary', 'بازگشت به گفت‌وگو');
  cancel.type = 'button';
  actions.append(back, next, cancel);
  root.append(heading, intro, progress, label, controlWrap, actions);

  function render() {
    actions.replaceChildren(back, next, cancel);
    back.hidden = false;
    next.hidden = false;
    const field = fields[index];
    progress.textContent = `مرحله ${(index + 1).toLocaleString('fa-IR')} از ${fields.length.toLocaleString('fa-IR')}`;
    label.textContent = field.label + (field.required ? ' ـ الزامی' : ' ـ اختیاری');
    controlWrap.replaceChildren();
    const input = node(field.kind === 'textarea' ? 'textarea' : 'input', 'ai-party-input');
    if (field.kind === 'textarea') input.rows = 3;
    else input.type = 'text';
    input.maxLength = field.key.toLowerCase().includes('address') ? 1000 : 1200;
    input.value = values[field.key] || '';
    input.placeholder = field.required ? 'این مورد را وارد کنید' : 'در صورت نیاز وارد کنید؛ در غیر این صورت رد کنید';
    input.setAttribute('aria-label', field.label);
    controlWrap.append(input);
    back.disabled = index === 0;
    next.textContent = index === fields.length - 1 ? 'بازبینی اطلاعات' : 'مرحله بعد';
    input.focus();
    next.onclick = () => {
      const value = input.value.trim();
      input.setCustomValidity('');
      if (field.required && !value) {
        input.setCustomValidity('تکمیل این مورد ضروری است.');
        input.reportValidity();
        input.focus();
        return;
      }
      values[field.key] = value;
      if (index < fields.length - 1) {
        index += 1;
        render();
        return;
      }
      renderReview();
    };
  }

  function renderReview() {
    const review = node('div', 'ai-document-review');
    review.append(node('h4', '', 'بازبینی اطلاعات پیش از تنظیم سند'));
    const list = node('dl', 'ai-document-review-list');
    for (const field of fields) {
      const value = values[field.key] || 'وارد نشده است';
      list.append(node('dt', '', field.label), node('dd', '', value));
    }
    review.append(list);
    const confirm = node('button', 'btn', 'تأیید اطلاعات و تنظیم پیش‌نویس');
    confirm.type = 'button';
    confirm.addEventListener('click', () => onComplete({ ...values }));
    const edit = node('button', 'btn secondary', 'اصلاح اطلاعات');
    edit.type = 'button';
    edit.addEventListener('click', () => { index = 0; render(); });
    controlWrap.replaceChildren(review);
    label.textContent = '';
    progress.textContent = 'اطلاعات واردشده را بررسی کنید.';
    actions.replaceChildren(edit, confirm, cancel);
    back.hidden = true;
    next.hidden = true;
  }

  back.addEventListener('click', () => {
    if (index > 0) { index -= 1; render(); }
  });
  cancel.addEventListener('click', onCancel);
  render();
  return root;
}

function htmlDocument(text, title) {
  const escaped = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>
  @page{size:A4;margin:22mm 20mm}body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:justify;line-height:2.1;font-size:13pt;color:#111}
  h1{font-size:17pt;text-align:center;margin:0 0 24px}pre{font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
  </style></head><body><h1>${title}</h1><pre>${escaped}</pre></body></html>`;
}

export function downloadWordDocument(text, title = 'سند حقوقی') {
  const blob = new Blob(['\ufeff', htmlDocument(text, title)], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'پیش‌نویس-حقوقی.doc';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function printDocumentPdf(text, title = 'سند حقوقی') {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(htmlDocument(text, title));
  popup.document.close();
  popup.addEventListener('load', () => popup.print(), { once: true });
  return true;
}
