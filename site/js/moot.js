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

const STAGES = [
  { id: 'facts', title: 'وقایع و مسائل' },
  { id: 'answers', title: 'تنظیم پاسخ' },
  { id: 'check', title: 'خودارزیابی' },
  { id: 'result', title: 'نتیجه' },
];

export function mootCourtPage() {
  const wrap = h('div', { class: 'moot' }, [
    h('span', { class: 'section-kicker', text: 'تمرین دادرسی · پروندهٔ فرضی آموزشی' }),
    h('h1', { text: 'موت‌کورت' }),
    h('p', { class: 'lead', text: 'یک پروندهٔ فرضی را مرحله‌به‌مرحله تحلیل کنید: ابتدا وقایع، سپس پاسخ به مسائل، و در پایان خودارزیابی.' }),
    h('div', {
      class: 'notice',
      role: 'note',
      text: 'این تمرین پروندهٔ فرضی دارد و جایگزین مشاورهٔ حقوقی نیست. ارزیابی با چک‌لیست خودتان انجام می‌شود، نه هوش مصنوعی. پاسخ‌ها ذخیره نمی‌شوند؛ قبل از خروج از صفحه متن خود را کپی کنید.',
    }),
  ]);

  // نوار مراحل
  const stepItems = STAGES.map((st, i) =>
    h('li', { 'data-stage': st.id }, [h('span', { class: 'num', text: String(i + 1) }), h('span', { text: st.title })])
  );
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'مراحل تمرین' }, stepItems);
  wrap.append(stepper);

  const answers = {};
  const boxes = [];
  const panels = {};

  // مرحله ۱: وقایع و مسائل
  const factsPanel = h('section', { class: 'case-panel' }, [
    h('h2', { text: CASE.title }),
    h('h3', { text: 'وقایع' }),
  ]);
  const facts = h('ol');
  for (const f of CASE.facts) facts.append(h('li', { text: f }));
  factsPanel.append(facts, h('h3', { text: 'مسائل حقوقی' }));
  const issuesList = h('ol');
  for (const issue of CASE.issues) issuesList.append(h('li', { text: issue.text }));
  factsPanel.append(issuesList);
  panels.facts = factsPanel;

  // مرحله ۲: پاسخ‌ها
  const answersPanel = h('form', { class: 'form', novalidate: '', 'aria-label': 'پاسخ موت‌کورت' });
  CASE.issues.forEach((issue, i) => {
    const ta = h('textarea', { id: `moot-${issue.id}`, rows: '6', maxlength: '4000' });
    answers[issue.id] = ta;
    answersPanel.append(h('div', { class: 'field' }, [h('label', { for: `moot-${issue.id}`, text: `مسئلهٔ ${i + 1}: ${issue.text}` }), ta]));
  });
  panels.answers = answersPanel;

  // مرحله ۳: چک‌لیست و ثبت
  const checkPanel = h('form', { class: 'form', novalidate: '', 'aria-label': 'خودارزیابی موت‌کورت' });
  const checklist = h('fieldset', { class: 'checklist' }, [h('legend', { text: 'چک‌لیست خودارزیابی' })]);
  CASE.rubric.forEach((item, i) => {
    const cb = h('input', { type: 'checkbox', id: `rub-${i}` });
    boxes.push(cb);
    checklist.append(h('label', { class: 'check-item', for: `rub-${i}` }, [cb, document.createTextNode(' ' + item)]));
  });
  checkPanel.append(checklist);
  const out = h('div', { role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'ثبت خودارزیابی' });
  checkPanel.append(h('div', { class: 'row' }, [submit]));
  panels.check = checkPanel;

  // مرحله ۴: نتیجه
  const resultPanel = h('section', { class: 'case-panel' }, [h('h2', { text: 'نتیجهٔ تمرین' }), out]);
  const reset = h('button', { class: 'btn secondary', type: 'button', text: 'پاک کردن و شروع دوباره' });
  resultPanel.append(h('div', { class: 'row' }, [reset]));
  panels.result = resultPanel;

  let current = 0;
  const prev = h('button', { class: 'btn secondary', type: 'button', text: '→ مرحلهٔ قبلی' });
  const next = h('button', { class: 'btn', type: 'button', text: 'مرحلهٔ بعد ←' });
  const nav = h('div', { class: 'row moot-nav' }, [prev, next]);
  const body = h('div', { class: 'moot-body' }, STAGES.map((st) => panels[st.id]));
  wrap.append(body, nav);

  function show(index) {
    current = Math.max(0, Math.min(STAGES.length - 1, index));
    STAGES.forEach((st, i) => {
      panels[st.id].hidden = i !== current;
      const li = stepper.children[i];
      li.classList.toggle('done', i < current);
      if (i === current) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    prev.hidden = current === 0;
    next.hidden = current === STAGES.length - 1;
    panels[STAGES[current].id].querySelector('h2, textarea, input, button')?.focus?.({ preventScroll: true });
  }

  prev.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));

  checkPanel.addEventListener('submit', (e) => {
    e.preventDefault();
    const checked = boxes.filter((b) => b.checked).length;
    const filled = Object.values(answers).filter((ta) => ta.value.trim().length >= 40).length;
    const pct = scoreRubric(checked, CASE.rubric.length);
    out.replaceChildren(
      h('p', { class: 'lead', text: `خودارزیابی: ${pct}٪ معیارها رعایت شده‌اند.` }),
      h('p', { text: `پاسخ‌های کامل (حداقل ۴۰ نویسه): ${filled} از ${CASE.issues.length}.` }),
      h('p', { class: 'muted', text: CASE.outlineHint })
    );
    show(3);
  });

  reset.addEventListener('click', () => {
    for (const ta of Object.values(answers)) ta.value = '';
    for (const b of boxes) b.checked = false;
    out.replaceChildren();
    show(0);
  });

  show(0);
  return wrap;
}
