// موت کورت: تمرین ساختاریافتهٔ دادرسی روی یک پروندهٔ فرضی.
// هیچ ارزیابی هوش مصنوعی ندارد؛ خودارزیابی با چک‌لیست انجام می‌شود. پاسخ‌ها روی سرور ذخیره نمی‌شوند.
import { h } from './dom.js';

// پروندهٔ کاملاً فرضی؛ نام‌ها و وقایع ساختگی‌اند و به شخص یا پرونده‌ای واقعی ربط ندارند.
export const CASE = Object.freeze({
  title: 'پروندهٔ فرضی: تأخیر در تحویل کالا',
  facts: [
    'آقای «الف» (فروشنده) و شرکت «ب» (خریدار) قراردادی برای خرید ۱۰۰ دستگاه دربارهٔ تاریخ معین تحویل امضا کردند.',
    'تحویل کالا با ۴۰ روز تأخیر انجام شد. خریدار دعوای مطالبهٔ خسارت تأخیر و فسخ جزئی قرارداد را طرح کرده است.',
    'فروشنده ادعا می‌کند تأخیر ناشی از اعتصاب سراسری حمل‌ونقل بوده که پیش از امضای قرارداد اعلام شده بود.',
    'در قرارداد بندی دربارهٔ حوادث غیرمترقبه و نحوهٔ اعلام آن وجود دارد، ولی شرط خسارت تأخیر به‌صورت مبلغ ثابت تعیین نشده است.',
  ],
  issues: [
    { id: 'i1', text: 'آیا تأخیر در تحویل محرز است و چه کسی باید آن را اثبات کند؟' },
    { id: 'i2', text: 'آیا اعتصاب حمل‌ونقل می‌تواند عذر موجه باشد؛ و آیا فروشنده آن را به‌موقع اعلام کرده است؟' },
    { id: 'i3', text: 'اگر خسارت تعلق بگیرد، مبنای محاسبه و میزان آن بر چه اساسی باید تعیین شود؟' },
  ],
  rubric: [
    'هر مسئله را جداگانه و با قاعدهٔ حقوقی مربوط بررسی کرده‌ام.',
    'واقعیت‌ها را فقط از متن پرونده آورده‌ام و چیزی را حدس نزده‌ام.',
    'استدلال طرف مقابل را خلاصه و به آن پاسخ داده‌ام.',
    'هر استناد را فقط با عنوان دقیق منبع و شماره (در صورت وجود) آورده‌ام.',
    'درخواست نهایی من برای دادگاه روشن و قابل اجراست.',
    'نتیجه‌گیری‌ام را به‌صورت «اگر ... آنگاه ...» و با احتمال‌های دیگر سنجیده‌ام.',
  ],
  outlineHint:
    'ساختار پیشنهادی: ۱) خلاصهٔ وقایع با ارجاع به متن پرونده؛ ۲) برای هر مسئله: قاعده، واقعه، نتیجه؛ ۳) پاسخ به دفاع طرف مقابل؛ ۴) درخواست نهایی. ارزیابی نهایی با وکیل یا استاد است.',
});

export function scoreRubric(checked, total) {
  if (!total) return 0;
  return Math.round((checked / total) * 100);
}

export function mootCourtPage() {
  const wrap = h('div', {}, [
    h('h1', { text: 'موت کورت (تمرین دادرسی)' }),
    h('div', {
      class: 'notice',
      role: 'note',
      text: 'این تمرین پروندهٔ فرضی دارد و جایگزین مشاورهٔ حقوقی نیست. ارزیابی با چک‌لیست خودتان انجام می‌شود، نه هوش مصنوعی. پاسخ‌ها ذخیره نمی‌شوند؛ قبل از خروج از صفحه متن خود را کپی کنید.',
    }),
    h('h2', { text: CASE.title }),
  ]);

  const facts = h('ul');
  for (const f of CASE.facts) facts.append(h('li', { text: f }));
  wrap.append(h('h3', { text: 'وقایع' }), facts);

  const answers = {};
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'پاسخ موت کورت' });
  wrap.append(form);
  CASE.issues.forEach((issue, i) => {
    const ta = h('textarea', { id: `moot-${issue.id}`, rows: '5', maxlength: '4000' });
    answers[issue.id] = ta;
    form.append(
      h('div', { class: 'field' }, [
        h('label', { for: `moot-${issue.id}`, text: `مسئلهٔ ${i + 1}: ${issue.text}` }),
        ta,
      ])
    );
  });

  // چک‌لیست خودارزیابی
  const boxes = [];
  const checklist = h('fieldset', { class: 'checklist' }, [h('legend', { text: 'چک‌لیست خودارزیابی' })]);
  CASE.rubric.forEach((item, i) => {
    const cb = h('input', { type: 'checkbox', id: `rub-${i}` });
    boxes.push(cb);
    checklist.append(h('label', { class: 'check-item', for: `rub-${i}` }, [cb, document.createTextNode(' ' + item)]));
  });
  form.append(checklist);

  const out = h('div', { role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'ثبت خودارزیابی' });
  const reset = h('button', { class: 'btn', type: 'button', text: 'پاک کردن پاسخ‌ها' });
  form.append(h('div', { class: 'row' }, [submit, reset]), out);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const checked = boxes.filter((b) => b.checked).length;
    const filled = Object.values(answers).filter((ta) => ta.value.trim().length >= 40).length;
    const pct = scoreRubric(checked, CASE.rubric.length);
    out.replaceChildren(
      h('p', { class: 'lead', text: `خودارزیابی: ${pct}٪ معیارها رعایت شده‌اند.` }),
      h('p', { text: `پاسخ‌های کامل (حداقل ۴۰ نویسه): ${filled} از ${CASE.issues.length}.` }),
      h('p', { class: 'muted', text: CASE.outlineHint })
    );
  });

  reset.addEventListener('click', () => {
    for (const ta of Object.values(answers)) ta.value = '';
    for (const b of boxes) b.checked = false;
    out.replaceChildren();
  });

  return wrap;
}
