import { postJson } from './api.js';
import { icon } from './icons.js';

const DATA_URL = '/data/ekhtebar-questions.json';
const SUBJECTS = ['همه دروس','حقوق مدنی','آیین دادرسی مدنی','حقوق کیفری','آیین دادرسی کیفری','حقوق تجارت','حقوق ثبت'];
const h = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
};
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');
const unique = (items) => [...new Set(items.filter(Boolean))];

function field(label, control) {
  return h('label', { class: 'ekhtebar-filter' }, [h('span', { text: label }), control]);
}
function select(options, value = '') {
  const node = h('select');
  for (const item of options) {
    const option = h('option', { value: item.value, text: item.label });
    if (item.value === value) option.selected = true;
    node.append(option);
  }
  return node;
}
function questionCard(item) {
  const tags = h('div', { class: 'ekhtebar-tags' }, item.tags.map((tag) => h('span', { class: 'ekhtebar-tag', text: tag })));
  const source = h('p', { class: 'ekhtebar-source', text: item.source_bar + (item.source_page ? ' · ' + item.source_page : '') });
  const answerButton = h('button', { class: 'btn secondary small ekhtebar-answer-button', type: 'button', text: 'دریافت پاسخ تشریحی و مستند' });
  const answerStatus = h('p', { class: 'ekhtebar-answer-status', role: 'status', text: '' });
  const answerContent = h('div', { class: 'ekhtebar-answer-content' });
  answerContent.hidden = true;
  answerButton.addEventListener('click', async () => {
    answerButton.disabled = true;
    answerButton.textContent = 'در حال تهیه پاسخ…';
    answerStatus.textContent = 'در حال تحلیل سؤال و جست‌وجوی مواد مرتبط در بانک قوانین آکادمی هستیم.';
    answerContent.hidden = true;
    answerContent.replaceChildren();
    const result = await postJson('/api/ai/ekhtebar/answer', {
      title: item.question_title,
      question: item.question_text,
      category: item.category,
      source: item.source_bar + (item.source_page ? ' · ' + item.source_page : ''),
    }, { timeoutMs: 60000 });
    answerButton.disabled = false;
    answerButton.textContent = 'تلاش دوباره برای دریافت پاسخ';
    if (!result.ok || !result.data?.ok) {
      const error = result.data?.error;
      answerStatus.textContent = error === 'UNAUTHENTICATED'
        ? 'برای دریافت پاسخ هوشمند ابتدا وارد حساب کاربری شوید.'
        : error === 'AI_NOT_CONFIGURED'
          ? 'سرویس هوش مصنوعی در حال حاضر روی سرور فعال نیست.'
          : error === 'AI_RATE_LIMITED'
            ? 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.'
            : 'تهیه پاسخ ممکن نشد. لطفاً دوباره تلاش کنید.';
      return;
    }
    answerStatus.textContent = 'پاسخ آموزشی آماده شد.';
    const answer = h('pre', { class: 'ekhtebar-answer-text', text: result.data.answer || '' });
    answerContent.append(h('h3', { text: 'پاسخ تشریحی و مستدل' }), answer);
    if (Array.isArray(result.data.legalSources) && result.data.legalSources.length) {
      const refs = h('div', { class: 'ekhtebar-answer-sources' }, [h('strong', { text: 'مواد بازیابی‌شده از بانک قوانین آکادمی' })]);
      for (const ref of result.data.legalSources) {
        const label = [ref.law, ref.article ? 'ماده ' + ref.article : '', ref.heading].filter(Boolean).join(' ـ ');
        refs.append(ref.url
          ? h('p', {}, [h('a', { href: ref.url, target: '_blank', rel: 'noopener noreferrer', text: label + (ref.source ? ' (' + ref.source + ')' : '') })])
          : h('p', { text: label }));
      }
      answerContent.append(refs);
    }
    for (const note of (result.data.notes || [])) answerContent.append(h('p', { class: 'ekhtebar-answer-note', text: note }));
    answerContent.append(h('p', { class: 'ekhtebar-answer-disclaimer', text: result.data.disclaimer || 'پاسخ صرفاً آموزشی است؛ پیش از استناد، قوانین و منابع رسمی روز بررسی شوند.' }));
    answerContent.hidden = false;
    answerButton.textContent = 'بازسازی پاسخ';
  });
  const body = h('div', { class: 'ekhtebar-question-body' }, [
    h('p', { class: 'ekhtebar-question-text', text: item.question_text }),
    tags,
    source,
    h('p', {}, [h('a', { href: item.source_url, target: '_blank', rel: 'noopener noreferrer', text: 'مشاهده منبع اصلی سؤال' })]),
    h('div', { class: 'ekhtebar-answer-tools' }, [answerButton, answerStatus]),
    answerContent,
  ]);
  const details = h('details', { class: 'ekhtebar-question' }, [
    h('summary', {}, [
      h('span', { class: 'ekhtebar-question-title', text: item.question_title }),
      h('span', { class: 'ekhtebar-question-meta', text: item.sub_category }),
      h('span', { class: 'ekhtebar-difficulty', text: item.difficulty }),
    ]),
    body,
  ]);
  details.dataset.questionId = item.id;
  return details;
}
function archiveCard(item) {
  return h('a', { class: 'ekhtebar-archive-card', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, [
    h('span', { class: 'ekhtebar-archive-years', text: item.years }),
    h('strong', { text: item.bar }),
    h('span', { class: 'muted', text: item.description }),
    h('span', { class: 'ekhtebar-archive-link', text: 'مشاهده آرشیو و منبع ←' }),
  ]);
}
function pdfLinks() {
  const files = [
    ['حقوق مدنی','https://www.ekhtebar.ir/wp-content/uploads/2026/05/حقوق-مدنی-.pdf'],
    ['آیین دادرسی مدنی','https://www.ekhtebar.ir/wp-content/uploads/2026/05/آیین-دادرسی-مدنی.pdf'],
    ['حقوق تجارت','https://www.ekhtebar.ir/wp-content/uploads/2026/05/حقوق-تجارت.pdf'],
    ['حقوق جزای عمومی و اختصاصی','https://www.ekhtebar.ir/wp-content/uploads/2026/05/حقوق-جزای-عمومی-و-اختصاصی.pdf'],
    ['آیین دادرسی کیفری','https://www.ekhtebar.ir/wp-content/uploads/2026/05/آیین-دادرسی-کیفری.pdf'],
    ['حقوق ثبت و امور حسبی','https://www.ekhtebar.ir/wp-content/uploads/2026/05/حقوق-ثبت-و-امور-حسبی.pdf'],
  ];
  return h('div', { class: 'ekhtebar-pdf-links' }, files.map(([name, url]) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, [icon('file-text', { size: 17 }), h('span', { text: name })])));
}

export async function ekhtebarPage() {
  if (!document.querySelector('link[data-page-style="ekhtebar"]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/css/ekhtebar.css';
    style.dataset.pageStyle = 'ekhtebar';
    document.head.append(style);
  }
  document.title = 'بانک سؤالات اختبار کانون‌های وکلای دادگستری | آکادمی وکالت شهرام مختاری';
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', 'آرشیو سؤالات اختبار کانون‌های وکلای دادگستری با دسته‌بندی حقوق مدنی، آیین دادرسی مدنی، حقوق کیفری، آیین دادرسی کیفری، تجارت و ثبت؛ همراه با فیلتر کانون، سال و سطح دشواری.');
  const root = h('section', { class: 'ekhtebar-page', dir: 'rtl' });
  root.append(
    h('a', { class: 'ekhtebar-back', href: '#/academy', text: '← بازگشت به آکادمی' }),
    h('div', { class: 'ekhtebar-hero' }, [
      h('span', { class: 'ekhtebar-kicker', text: 'آرشیو آموزشی آکادمی' }),
      h('h1', { text: 'بانک سؤالات اختبار کانون‌های وکلای دادگستری' }),
      h('p', { class: 'lead', text: 'جست‌وجو و مطالعه سؤالات تشریحی اختبار، تفکیک‌شده بر اساس درس، موضوع حقوقی، کانون و سال برگزاری.' }),
      h('p', { class: 'ekhtebar-note', text: 'سؤالات این بانک از منابع منتشرشده بازنویسی نگارشی شده‌اند؛ برای استناد و تطبیق، منبع اصلی هر سؤال در دسترس است. سطح دشواری، ارزیابی آموزشی آکادمی است.' }),
    ])
  );
  const loading = h('p', { class: 'loading', role: 'status', text: 'در حال بارگذاری بانک سؤالات…' });
  root.append(loading);
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error('BANK_UNAVAILABLE');
    const data = await response.json();
    loading.remove();
    const records = Array.isArray(data.records) ? data.records : [];
    const filters = h('div', { class: 'ekhtebar-filters panel' });
    const search = h('input', { type: 'search', placeholder: 'جست‌وجو در عنوان، متن سؤال، موضوع و کلیدواژه‌ها…', 'aria-label': 'جست‌وجو در سؤالات' });
    const subject = select(SUBJECTS.map((x) => ({ value: x === 'همه دروس' ? '' : x, label: x })));
    const bars = select([{ value: '', label: 'همه کانون‌ها' }, ...unique(records.map((x) => x.source_bar.split(' ـ ')[0])).map((x) => ({ value: x, label: x }))]);
    const years = select([{ value: '', label: 'همه سال‌ها' }, ...unique(records.map((x) => (x.source_bar.match(/(?:۱۳|۱۴)\d{2}/) || [])[0])).sort().reverse().map((x) => ({ value: x, label: x }))]);
    const levels = select([{ value: '', label: 'همه سطوح دشواری' }, ...['مبتدی','متوسط','پیشرفته/ارشد'].map((x) => ({ value: x, label: x }))]);
    const reset = h('button', { class: 'btn secondary small', type: 'button', text: 'پاک‌کردن فیلترها' });
    filters.append(
      field('عبارت جست‌وجو', search),
      field('درس', subject),
      field('کانون', bars),
      field('سال', years),
      field('سطح دشواری', levels),
      h('div', { class: 'ekhtebar-filter-action' }, [reset])
    );
    const stats = h('div', { class: 'ekhtebar-stats', 'aria-live': 'polite' });
    const list = h('div', { class: 'ekhtebar-question-list' });
    const empty = h('p', { class: 'notice', text: 'با این فیلترها سؤالی پیدا نشد.' });
    empty.hidden = true;
    const update = () => {
      const term = search.value.trim().toLocaleLowerCase('fa');
      const filtered = records.filter((item) => {
        const haystack = [item.question_title,item.question_text,item.sub_category,item.source_bar,...(item.tags||[])].join(' ').toLocaleLowerCase('fa');
        return (!term || haystack.includes(term))
          && (!subject.value || item.category === subject.value)
          && (!bars.value || item.source_bar.startsWith(bars.value))
          && (!years.value || item.source_bar.includes(years.value))
          && (!levels.value || item.difficulty === levels.value);
      });
      list.replaceChildren(...filtered.map(questionCard));
      empty.hidden = filtered.length > 0;
      stats.textContent = 'نمایش ' + faNum(filtered.length) + ' از ' + faNum(records.length) + ' رکورد ثبت‌شده';
    };
    [search,subject,bars,years,levels].forEach((control) => control.addEventListener('input', update));
    reset.addEventListener('click', () => {
      search.value = ''; subject.value = ''; bars.value = ''; years.value = ''; levels.value = ''; update();
    });
    update();
    root.append(filters, stats, list, empty);
    const archive = h('section', { class: 'ekhtebar-archives' }, [
      h('h2', { text: 'آرشیو منابع کانون‌ها' }),
      h('p', { class: 'muted', text: 'برای دوره‌هایی که متن سؤال‌ها هنوز به‌صورت رکورد مستقل وارد بانک نشده، به آرشیو اصلی کانون یا منبع منتشرکننده مراجعه کنید.' }),
      h('div', { class: 'ekhtebar-archive-grid' }, (data.archives || []).map(archiveCard)),
    ]);
    root.append(archive, h('section', { class: 'ekhtebar-original-files' }, [
      h('h2', { text: 'فایل‌های اصلی کانون مرکز ـ دوره‌های ۱۳۹۷ تا ۱۴۰۴' }),
      pdfLinks(),
    ]));
  } catch {
    loading.className = 'notice';
    loading.textContent = 'بارگذاری بانک سؤالات ممکن نشد. لطفاً صفحه را دوباره بارگذاری کنید.';
  }
  return root;
}
