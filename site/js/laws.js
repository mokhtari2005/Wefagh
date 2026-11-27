import { formatShamsi } from './shamsi.js';

const TYPE_LABELS = {
  law: 'قانون', treaty: 'معاهده و کنوانسیون', bylaw: 'آیین‌نامه',
  executive_regulation: 'تصویب‌نامه و مقرره', executive_circular: 'بخشنامه و دستورالعمل',
  circular: 'بخشنامه', executive_resolution: 'مصوبه', general_policies: 'سیاست کلی',
  supreme_court_unified_precedent: 'رأی وحدت رویه دیوان عالی کشور',
  supreme_court_insistence_precedent: 'رأی اصراری دیوان عالی کشور',
  administrative_court_unified_precedent: 'رأی وحدت رویه دیوان عدالت اداری',
  administrative_court_general_board: 'رأی هیئت عمومی دیوان عدالت اداری',
  administrative_court_specialized_board: 'رأی هیئت تخصصی دیوان عدالت اداری',
  administrative_court_decision: 'رأی دیوان عدالت اداری',
  judicial_advisory_opinion: 'نظریه مشورتی اداره کل حقوقی',
  advisory_opinion: 'نظریه مشورتی', guardian_council_opinion: 'نظر تفسیری شورای نگهبان',
  parliamentary_review_opinion: 'نظر رئیس مجلس', parliamentary_research: 'پژوهش حقوقی مجلس',
  judicial_circular: 'بخشنامه قضایی', judicial_decision: 'رأی قضایی',
  judicial_session: 'نشست قضایی', bill: 'طرح و لایحه', interpretive_law: 'قانون تفسیری و استفساریه',
  expediency_council_resolution: 'مصوبه مجمع تشخیص مصلحت', fatwa: 'استفتاء و مسئله فقهی', other: 'سایر اسناد',
};

const h = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') element.textContent = value;
    else if (key === 'class') element.className = value;
    else if (value != null) element.setAttribute(key, String(value));
  }
  for (const child of children) element.append(child);
  return element;
};
const fa = (value) => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
const dateLabel = (value) => {
  if (!value) return 'ثبت نشده';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatShamsi(date);
};
const statusLabel = (status) => ({
  verified: 'تأییدشده', needs_review: 'در حال بررسی', amended: 'اصلاح‌شده', repealed: 'منسوخ',
}[status] || 'نامشخص');

async function requestJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP_' + response.status));
  return data;
}

function statCard(title, value, note, icon) {
  return h('article', { class: 'legal-bank-stat' }, [
    h('span', { class: 'legal-bank-stat-icon', 'aria-hidden': 'true', text: icon }),
    h('div', {}, [
      h('span', { class: 'legal-bank-stat-title', text: title }),
      h('strong', { class: 'legal-bank-stat-value', text: fa(value) }),
      h('small', { class: 'legal-bank-stat-note', text: note || '' }),
    ]),
  ]);
}
function statusPill(status) {
  return h('span', { class: 'legal-bank-status status-' + status, text: statusLabel(status) });
}
function documentCard(doc, onOpen) {
  const button = h('button', { class: 'legal-bank-document', type: 'button' }, [
    h('span', { class: 'legal-bank-document-main' }, [
      h('strong', { text: doc.title || 'سند بدون عنوان' }),
      h('small', { text: [
        TYPE_LABELS[doc.lawType] || doc.lawType,
        doc.documentNumber ? 'شماره ' + doc.documentNumber : '',
        doc.documentDate || doc.approvedDate || '',
      ].filter(Boolean).join(' · ') }),
    ]),
    h('span', { class: 'legal-bank-document-meta' }, [
      h('span', { text: fa(doc.articleCount) + ' ماده/بخش' }),
      statusPill(doc.status),
    ]),
  ]);
  button.addEventListener('click', () => onOpen(doc));
  return button;
}

export function legalBankPage() {
  const root = h('section', { class: 'legal-bank-page' });
  const hero = h('header', { class: 'legal-bank-hero' }, [
    h('div', { class: 'legal-bank-kicker', text: 'مرجع متون حقوقی و مقررات' }),
    h('h1', { text: 'بانک قوانین و مقررات' }),
    h('p', { text: 'بانک حقوقی آکادمی وکالت شهرام مختاری؛ نمایه‌ای برای مشاهده قوانین، مقررات، آرای قضایی و نظریات حقوقی.' }),
    h('p', { class: 'legal-bank-readonly', text: 'این صفحه فقط برای مشاهده و جست‌وجو است؛ ثبت و ویرایش اسناد از این بخش انجام نمی‌شود.' }),
    h('p', { class: 'legal-bank-readonly', text: 'بانک هر روز به‌صورت خودکار به‌روزرسانی می‌شود؛ زمان آخرین بررسی و همگام‌سازی هر منبع در همین صفحه نمایش داده می‌شود.' }),
  ]);
  const statsArea = h('div', { class: 'legal-bank-stats', 'aria-live': 'polite' }, [
    h('p', { class: 'loading', text: 'در حال دریافت آمار بانک…' }),
  ]);
  const sourceArea = h('section', { class: 'legal-bank-panel' }, [
    h('div', { class: 'legal-bank-section-heading' }, [
      h('h2', { text: 'آخرین وضعیت منابع' }),
      h('span', { class: 'muted', text: 'زمان آخرین همگام‌سازی ثبت‌شده' }),
    ]),
    h('p', { class: 'loading', text: 'در حال دریافت اطلاعات منابع…' }),
  ]);
  const searchInput = h('input', { type: 'search', placeholder: 'جست‌وجو در عنوان قانون، شماره سند یا موضوع', 'aria-label': 'جست‌وجوی بانک قوانین' });
  const typeSelect = h('select', { 'aria-label': 'نوع سند' }, [
    h('option', { value: '', text: 'همه انواع اسناد' }),
    ...Object.entries(TYPE_LABELS).filter(([key]) => key !== 'other').map(([key, label]) => h('option', { value: key, text: label })),
  ]);
  const searchButton = h('button', { class: 'btn primary', type: 'submit', text: 'جست‌وجو' });
  const searchForm = h('form', { class: 'legal-bank-search-form' }, [searchInput, typeSelect, searchButton]);
  const resultsArea = h('div', { class: 'legal-bank-results', 'aria-live': 'polite' }, [
    h('p', { class: 'muted', text: 'آخرین اسناد ثبت‌شده در بانک در این بخش نمایش داده می‌شوند.' }),
  ]);
  const searchPanel = h('section', { class: 'legal-bank-panel' }, [
    h('div', { class: 'legal-bank-section-heading' }, [
      h('h2', { text: 'جست‌وجو و مشاهده اسناد' }),
      h('span', { class: 'muted', text: 'نمایش ۳۰ نتیجه در هر صفحه' }),
    ]),
    searchForm, resultsArea,
  ]);
  const detailPanel = h('section', { class: 'legal-bank-panel legal-bank-detail', hidden: '' });
  root.append(hero, statsArea, sourceArea, searchPanel, detailPanel);

  let searchPage = 1;

  async function openDocument(doc) {
    detailPanel.hidden = false;
    detailPanel.replaceChildren(h('p', { class: 'loading', text: 'در حال دریافت اطلاعات سند…' }));
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const params = doc.id ? 'id=' + encodeURIComponent(doc.id) : 'slug=' + encodeURIComponent(doc.slug);
      const data = await requestJson('/api/legal-bank/public-document?' + params + '&limit=20');
      const item = data.document;
      const close = h('button', { class: 'btn secondary', type: 'button', text: 'بستن' });
      close.addEventListener('click', () => { detailPanel.hidden = true; });
      const header = h('div', { class: 'legal-bank-detail-head' }, [
        h('div', {}, [
          h('span', { class: 'legal-bank-kicker', text: TYPE_LABELS[item.lawType] || item.lawType }),
          h('h2', { text: item.title }),
          h('p', { class: 'muted', text: [
            item.documentNumber ? 'شماره ' + item.documentNumber : '',
            item.documentDate || item.approvedDate || '',
            item.issuingAuthority || '',
          ].filter(Boolean).join(' · ') }),
        ]),
        close,
      ]);
      const content = h('div', { class: 'legal-bank-article-list' });
      if (!data.textAvailable) {
        content.append(h('div', { class: 'notice', role: 'note', text: data.message || 'متن این سند هنوز برای انتشار عمومی تأیید نشده است.' }));
      } else if (!data.articles || !data.articles.length) {
        content.append(h('p', { class: 'muted', text: 'برای این سند هنوز ماده تأییدشده‌ای ثبت نشده است.' }));
      } else {
        for (const article of data.articles) {
          content.append(h('article', { class: 'legal-bank-article' }, [
            h('h3', { text: article.heading || article.number }),
            h('p', { text: article.body }),
          ]));
        }
        if (data.nextOffset != null) {
          let nextOffset = data.nextOffset;
          const more = h('button', { class: 'btn secondary', type: 'button', text: 'نمایش بخش‌های بعدی' });
          more.addEventListener('click', async () => {
            more.disabled = true;
            try {
              const next = await requestJson('/api/legal-bank/public-document?' + params + '&offset=' + nextOffset + '&limit=20');
              for (const article of next.articles || []) {
                content.append(h('article', { class: 'legal-bank-article' }, [
                  h('h3', { text: article.heading || article.number }),
                  h('p', { text: article.body }),
                ]));
              }
              nextOffset = next.nextOffset;
              if (nextOffset == null) more.remove();
              else more.disabled = false;
            } catch {
              more.disabled = false;
              more.textContent = 'تلاش دوباره برای دریافت بخش‌ها';
            }
          });
          content.append(more);
        }
      }
      const links = h('div', { class: 'legal-bank-source-links' });
      if (item.officialSourceUrl) links.append(h('a', { href: item.officialSourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'مشاهده منبع رسمی' }));
      if (item.sourceUrl && item.sourceUrl !== item.officialSourceUrl) links.append(h('a', { href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'مشاهده منبع ثبت‌شده' }));
      detailPanel.replaceChildren(header, statusPill(item.status), content, links);
    } catch {
      detailPanel.replaceChildren(h('p', { class: 'notice', role: 'alert', text: 'دریافت اطلاعات سند انجام نشد. دوباره تلاش کنید.' }));
    }
  }

  function renderResults(items, hasMore = false) {
    resultsArea.replaceChildren();
    if (!items.length) {
      resultsArea.append(h('p', { class: 'muted', text: 'سندی با این مشخصات پیدا نشد.' }));
      return;
    }
    for (const item of items) resultsArea.append(documentCard(item, openDocument));
    if (hasMore) {
      const more = h('button', { class: 'btn secondary', type: 'button', text: 'نتایج بعدی' });
      more.addEventListener('click', () => runSearch(searchPage + 1));
      resultsArea.append(more);
    }
  }

  async function runSearch(page = 1) {
    const query = searchInput.value.trim();
    const type = typeSelect.value;
    if (query.length < 2 && !type) {
      resultsArea.replaceChildren(h('p', { class: 'muted', text: 'برای جست‌وجو دست‌کم دو نویسه وارد کنید یا نوع سند را انتخاب کنید.' }));
      return;
    }
    searchPage = page;
    resultsArea.replaceChildren(h('p', { class: 'loading', text: 'در حال جست‌وجو…' }));
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set('q', query);
    if (type) params.set('type', type);
    try {
      const data = await requestJson('/api/legal-bank/public-search?' + params);
      renderResults(data.items || [], data.hasMore);
    } catch {
      resultsArea.replaceChildren(h('p', { class: 'notice', role: 'alert', text: 'جست‌وجو در حال حاضر انجام نشد. دوباره تلاش کنید.' }));
    }
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(1);
  });

  async function loadStats() {
    try {
      const data = await requestJson('/api/legal-bank/public-stats');
      const docs = data.totals && data.totals.documents || {};
      const articles = data.totals && data.totals.articles || {};
      const byType = new Map();
      const byTypeVerified = new Map();
      for (const row of data.byType || []) {
        byType.set(row.type, (byType.get(row.type) || 0) + Number(row.count || 0));
        if (row.status === 'verified') byTypeVerified.set(row.type, (byTypeVerified.get(row.type) || 0) + Number(row.count || 0));
      }
      const sum = (types) => types.reduce((total, type) => total + (byType.get(type) || 0), 0);
      statsArea.replaceChildren(
        statCard('قانون', sum(['law']), fa(byTypeVerified.get('law') || 0) + ' تأییدشده', '§'),
        statCard('آیین‌نامه و مقرره', sum(['bylaw','executive_regulation']), fa(sum(['executive_circular','circular','executive_resolution'])) + ' بخشنامه و مصوبه', '▤'),
        statCard('ماده و بخش ثبت‌شده', articles.total, fa(articles.verified) + ' دارای متن تأییدشده', '¶'),
        statCard('رأی وحدت رویه دیوان عالی کشور', sum(['supreme_court_unified_precedent','supreme_court_insistence_precedent']), 'آرای وحدت رویه و اصراری', '⚖'),
        statCard('رأی هیئت عمومی دیوان عدالت اداری', sum(['administrative_court_general_board','administrative_court_unified_precedent']), 'آرای هیئت عمومی و وحدت رویه', '◈'),
        statCard('نظریه مشورتی اداره کل حقوقی', sum(['judicial_advisory_opinion','advisory_opinion']), 'نظریات و پاسخ‌های مشورتی', '❞'),
        statCard('بخش مصوبه و بخشنامه', sum(['executive_resolution','executive_circular','judicial_circular','circular']), 'مصوبات و دستورالعمل‌ها', '▧'),
        statCard('نظر تفسیری شورای نگهبان', sum(['guardian_council_opinion']), 'نظرات تفسیری و اعلام نظرها', '⚖'),
        statCard('قانون تفسیری و استفساریه', sum(['interpretive_law']), 'قوانین و اسناد تفسیری', '§'),
        statCard('مصوبه مجمع تشخیص مصلحت', sum(['expediency_council_resolution']), 'مصوبات ثبت‌شده مجمع', '◉'),
        statCard('استفتاء و مسئله فقهی', sum(['fatwa']), 'پرسش‌ها و پاسخ‌های فقهی', '❖'),
        statCard('سایر اسناد حقوقی', sum(['treaty','bill','general_policies','judicial_decision','judicial_session','parliamentary_review_opinion','parliamentary_research','other']), 'معاهدات، طرح‌ها و رویه قضایی', '▦'),
      );
      sourceArea.replaceChildren(
        h('div', { class: 'legal-bank-section-heading' }, [
          h('h2', { text: 'آخرین وضعیت منابع' }),
          h('span', { class: 'muted', text: 'آخرین تغییر ثبت‌شده در بانک: ' + dateLabel(docs.lastUpdated) }),
        ]),
        ...(data.sources || []).map((source) => h('div', { class: 'legal-bank-source-row' }, [
          h('div', {}, [
            h('strong', { text: source.title }),
            h('small', { text: source.authority }),
          ]),
          h('div', { class: 'legal-bank-source-date' }, [
            h('span', { class: source.syncStatus === 'warning' ? 'legal-bank-source-warning' : 'legal-bank-source-ok', text: source.syncStatus === 'warning' ? 'محدودیت یا خطای دسترسی' : 'وضعیت عادی' }),
            h('span', { text: source.lastSuccessAt ? 'آخرین همگام‌سازی: ' + dateLabel(source.lastSuccessAt) : (source.lastCheckedAt ? 'آخرین بررسی: ' + dateLabel(source.lastCheckedAt) : 'همگام‌سازی ثبت نشده') }),
            h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', text: 'وبگاه منبع' }),
          ]),
        ])),
      );
      renderResults(data.latest || []);
    } catch {
      statsArea.replaceChildren(h('p', { class: 'notice', role: 'alert', text: 'دریافت آمار بانک انجام نشد. صفحه را دوباره بارگذاری کنید.' }));
      sourceArea.replaceChildren(h('p', { class: 'muted', text: 'اطلاعات منابع در دسترس نیست.' }));
    }
  }

  loadStats();
  return root;
}
