// بانک پرونده‌های آموزشی: فهرست با جست‌وجو و فیلتر، و جزئیات هر پرونده. فقط پرونده‌های منتشرشده از API می‌آیند.
// محتوای API با textContent در DOM درج می‌شود.
import { getJson } from './api.js';
import { BANK_AREAS, BANK_DIFFICULTY_LABEL } from './moot-bank-constants.js';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

const INTRO = 'پرونده‌های آموزشی برای تمرین تشخیص مسئله، ارزیابی دلیل و طراحی راهبرد. هر پرونده پیش از انتشار توسط گروه بررسی حقوقی می‌شود و جایگزین مشاورهٔ حقوقی یا منابع رسمی نیست.';

/** فهرست پرونده‌ها با جست‌وجو و فیلتر. */
function listView(wrap) {
  const search = h('input', { type: 'search', name: 'q', maxlength: '100', placeholder: 'جست‌وجو در عنوان یا موضوع دعوا', 'aria-label': 'جست‌وجو در پرونده‌ها' });
  const area = h('select', { name: 'area', 'aria-label': 'حوزهٔ حقوقی' }, [
    h('option', { value: '', text: 'همهٔ حوزه‌ها' }),
    ...BANK_AREAS.map((a) => h('option', { value: a, text: a })),
  ]);
  const difficulty = h('select', { name: 'difficulty', 'aria-label': 'سطح' }, [
    h('option', { value: '', text: 'همهٔ سطوح' }),
    ...Object.entries(BANK_DIFFICULTY_LABEL).map(([v, t]) => h('option', { value: v, text: t })),
  ]);
  const count = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { class: 'cards', 'aria-live': 'polite' });
  const filters = h('form', { class: 'case-filters', role: 'search' }, [search, area, difficulty]);
  wrap.append(filters, count, results);

  let timer = null;
  async function load() {
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('q', search.value.trim());
    if (area.value) params.set('area', area.value);
    if (difficulty.value) params.set('difficulty', difficulty.value);
    const qs = params.toString();
    const res = await getJson(`/api/cases${qs ? `?${qs}` : ''}`);
    results.replaceChildren();
    if (!res.ok) {
      count.textContent = '';
      results.append(h('p', { class: 'form-status err', role: 'alert', text: res.status === 422 ? 'فیلترهای جست‌وجو نامعتبر است.' : 'دریافت بانک پرونده‌ها ناموفق بود؛ دوباره تلاش کنید.' }));
      return;
    }
    const items = res.data.cases || [];
    const filtered = Boolean(qs);
    count.textContent = items.length ? `${items.length} پرونده` : '';
    if (!items.length) {
      results.append(h('div', { class: 'notice', role: 'note', text: filtered
        ? 'پرونده‌ای با این جست‌وجو یا فیلتر پیدا نشد.'
        : 'هنوز پرونده‌ای منتشر نشده است. پرونده‌ها پس از بررسی حقوقی و تأیید استنادها در این بخش نمایش داده می‌شوند.' }));
      return;
    }
    for (const item of items) {
      results.append(h('a', { class: 'card', href: `#/cases/${encodeURIComponent(item.id)}` }, [
        h('span', { class: 'badge', text: `${item.area} · ${item.level}` }),
        h('h2', { text: item.title }),
        h('p', { text: item.summary }),
        h('p', { class: 'muted', text: `${item.issueCount} مسئلهٔ قابل تحلیل` }),
      ]));
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  search.addEventListener('input', schedule);
  area.addEventListener('change', load);
  difficulty.addEventListener('change', load);
  filters.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
}

const REF_STATUS_LABEL = { verified: 'تأییدشده', corrected: 'اصلاح‌شده', needs_review: 'در انتظار بررسی' };

/** جزئیات یک پرونده؛ استنادی که هنوز تأیید نشده‌اند با برچسب مشخص نمایش داده می‌شوند. */
function detailView(wrap, item) {
  wrap.append(h('p', { class: 'muted', text: `${item.area} · سطح ${item.level}` }));
  const section = (title, node) => { wrap.append(h('h2', { text: title }), node); };
  if (item.subject) section('موضوع دعوا', h('p', { text: item.subject }));
  if (item.parties) section('طرفین', h('ul', {}, [
    h('li', { text: `خواهان: ${item.parties.plaintiff}` }),
    h('li', { text: `خوانده: ${item.parties.defendant}` }),
  ]));
  if (item.request?.claim) section('خواسته', h('p', { text: item.request.claim }));
  if (item.facts?.length) section('شرح وقایع', h('ol', {}, item.facts.map((f) => h('li', { text: f }))));
  if (item.issues?.length) section('مسائل حقوقی برای تحلیل', h('ol', {}, item.issues.map((i) => h('li', { text: i.text || i }))));
  if (item.claims) section('ادعا و دفاع اولیهٔ طرفین', h('dl', { class: 'review-summary' }, [
    h('div', { class: 'review-row' }, [h('dt', { text: 'خواهان' }), h('dd', { text: item.claims.plaintiff })]),
    h('div', { class: 'review-row' }, [h('dt', { text: 'خوانده' }), h('dd', { text: item.claims.defendant })]),
  ]));
  if (item.documents?.length) section('مستندات پرونده', h('ul', {}, item.documents.map((d) => h('li', {}, [
    h('strong', { text: d.title }), document.createTextNode(` — ${d.summary}`),
  ]))));
  if (item.legalRefs?.length) {
    section('قوانین مرتبط', h('ul', { class: 'legal-refs' }, item.legalRefs.map((r) => h('li', {}, [
      h('strong', { text: r.law }),
      document.createTextNode(` · ${r.topic}`),
      r.article ? document.createTextNode(` · ماده ${r.article}`) : null,
      h('span', { class: `badge ${r.status === 'needs_review' ? 'badge-draft' : 'badge-soft'}`, text: REF_STATUS_LABEL[r.status] || r.status }),
      r.source ? h('small', { class: 'muted', text: `منبع: ${r.source}` }) : null,
    ]))));
  }
  wrap.append(h('div', { class: 'notice', role: 'note', text: 'این پرونده صرفاً نقطهٔ شروع بررسی است؛ ارتباط، اصالت، کفایت و آثار هر دلیل باید مستقل ارزیابی شود. استنادهایی که «در انتظار بررسی» هستند هنوز تأیید نشده‌اند.' }));
  wrap.append(h('div', { class: 'row' }, [
    h('a', { class: 'btn secondary', href: '#/cases', text: 'بازگشت به بانک پرونده‌ها' }),
    h('a', { class: 'btn', href: `#/moot-court?case=${encodeURIComponent(item.id)}`, text: 'تمرین مکتوب با این پرونده' }),
    h('a', { class: 'btn secondary', href: '#/moot-court/cases', text: 'انتخاب برای جلسهٔ دادرسی' }),
  ]));
}

export async function casesPage(caseId = '') {
  const wrap = h('div', {}, [
    h('span', { class: 'section-kicker', text: 'کارگاه تحلیل پرونده' }),
    h('h1', { text: caseId ? 'جزئیات پرونده' : 'بانک پرونده‌های آموزشی' }),
  ]);
  if (!caseId) {
    wrap.append(h('p', { class: 'lead', text: INTRO }));
    listView(wrap);
    return wrap;
  }
  const response = await getJson(`/api/cases/${encodeURIComponent(caseId)}`);
  if (!response.ok) {
    wrap.append(h('p', { class: 'form-status err', role: 'alert', text: response.status === 404 ? 'پرونده پیدا نشد یا هنوز منتشر نشده است.' : 'دریافت پرونده ناموفق بود.' }));
    wrap.append(h('p', {}, [h('a', { href: '#/cases', text: 'نمایش همهٔ پرونده‌ها' })]));
    return wrap;
  }
  wrap.querySelector('h1').textContent = response.data.case.title;
  detailView(wrap, response.data.case);
  return wrap;
}
