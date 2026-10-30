// صفحهٔ انتخاب پرونده برای دادگاه مجازی: پیشنهادهای چرخشی، جست‌وجو و فیلتر، سوابق کاربر و شروع جلسه.
// همهٔ داده‌ها از API بانک (admin_content با وضعیت منتشرشده) می‌آیند؛ هیچ پروندهٔ نمونهٔ ثابتی در مرورگر نیست.
import { h } from './dom.js';
import { getJson, postJson } from './api.js';
import { BANK_AREAS, BANK_DIFFICULTY_LABEL } from './moot-bank-constants.js';

const SEARCH_DELAY_MS = 300;

function notice(text, cls = 'notice') {
  return h('div', { class: cls, role: 'note', text });
}

function caseCard(c, { loggedIn, reason = '' }) {
  const startButton = h('button', { class: 'btn', type: 'button', text: 'شروع جلسه با این پرونده' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: 'true' });
  startButton.addEventListener('click', async () => {
    if (!loggedIn) {
      error.textContent = 'برای شروع جلسه ابتدا وارد حساب خود شوید.';
      error.hidden = false;
      return;
    }
    startButton.disabled = true;
    const res = await postJson(`/api/moot/cases/${encodeURIComponent(c.id)}/select`, {});
    if (!res.ok) {
      startButton.disabled = false;
      error.textContent = 'ثبت انتخاب پرونده انجام نشد؛ دوباره تلاش کنید.';
      error.hidden = false;
      return;
    }
    window.location.hash = `#/moot-court/hearing?case=${encodeURIComponent(c.id)}`;
  });
  return h('article', { class: 'card case-card' }, [
    h('div', { class: 'case-card-meta' }, [
      h('span', { class: 'badge', text: c.area || '' }),
      h('span', { class: 'badge', text: c.level || BANK_DIFFICULTY_LABEL[c.difficulty] || '' }),
      reason ? h('span', { class: 'badge badge-soft', text: reason }) : null,
    ].filter(Boolean)),
    h('h3', { text: c.title }),
    h('p', { class: 'muted', text: c.summary || c.subject || '' }),
    h('p', { class: 'case-card-subject', text: c.subject ? `موضوع دعوا: ${c.subject}` : '' }),
    h('p', { class: 'muted', text: `${c.issueCount || 0} مسئلهٔ حقوقی` }),
    error,
    h('div', { class: 'case-card-actions' }, [startButton]),
  ]);
}

function selectField(label, options, value) {
  const select = h('select', { 'aria-label': label });
  select.append(h('option', { value: '', text: label }));
  for (const [v, text] of options) select.append(h('option', { value: v, text }));
  select.value = value;
  return select;
}

/** صفحهٔ انتخاب پرونده؛ بدون ورود هم قابل مشاهده است، اما شروع جلسه و سوابق نیاز به ورود دارد. */
export function casePickerPage() {
  const body = h('section', { class: 'container moot-cases-page' });
  body.append(h('h1', { text: 'انتخاب پرونده' }), h('p', { class: 'muted', text: 'پرونده‌ها پس از تأیید استنادهای حقوقی منتشر می‌شوند. فقط پرونده‌های منتشرشده نمایش داده می‌شوند.' }));

  const suggestionsBox = h('div', { class: 'moot-suggestions' }, [h('p', { class: 'muted', text: 'در حال تهیهٔ پیشنهادها…' })]);
  const listBox = h('div', { class: 'moot-case-list', 'aria-live': 'polite' }, [h('p', { class: 'muted', text: 'در حال بارگذاری…' })]);
  const historyBox = h('div', { class: 'moot-history' });

  const search = h('input', { type: 'search', placeholder: 'جست‌وجو در عنوان، موضوع یا خلاصه', 'aria-label': 'جست‌وجوی پرونده', maxlength: '120' });
  const area = selectField('همهٔ حوزه‌ها', BANK_AREAS.map((a) => [a, a]), '');
  const difficulty = selectField('همهٔ سطوح', Object.entries(BANK_DIFFICULTY_LABEL), '');
  const rotate = h('button', { class: 'btn btn-ghost', type: 'button', text: 'پیشنهادهای دیگر' });
  const filters = h('div', { class: 'moot-filters' }, [search, area, difficulty]);

  let loggedIn = false;
  let timer = null;

  async function loadSuggestions() {
    suggestionsBox.replaceChildren(h('p', { class: 'muted', text: 'در حال تهیهٔ پیشنهادها…' }));
    const res = await getJson('/api/moot/cases/suggest?count=5');
    if (!res.ok) {
      suggestionsBox.replaceChildren(notice('پیشنهادها در دسترس نیستند؛ فهرست کامل پایین را ببینید.'));
      return;
    }
    const items = res.data?.cases || [];
    suggestionsBox.replaceChildren(...(items.length
      ? items.map((c) => caseCard(c, { loggedIn, reason: c.reason }))
      : [notice('هنوز پرونده‌ای برای پیشنهاد منتشر نشده است.')]));
  }

  async function loadList() {
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('q', search.value.trim());
    if (area.value) params.set('area', area.value);
    if (difficulty.value) params.set('difficulty', difficulty.value);
    const res = await getJson(`/api/moot/cases?${params.toString()}`);
    if (!res.ok) {
      listBox.replaceChildren(notice('فهرست پرونده‌ها در دسترس نیست. کمی بعد دوباره تلاش کنید.'));
      return;
    }
    const items = res.data?.cases || [];
    listBox.replaceChildren(...(items.length
      ? items.map((c) => caseCard(c, { loggedIn }))
      : [notice('پرونده‌ای با این فیلتر پیدا نشد.')]));
  }

  async function loadHistory() {
    const [history, list] = await Promise.all([getJson('/api/moot/history'), getJson('/api/moot/cases')]);
    if (!history.ok || !list.ok) {
      historyBox.replaceChildren(notice('سوابق در دسترس نیستند.'));
      return;
    }
    const titles = new Map((list.data?.cases || []).map((c) => [c.id, c]));
    const rows = history.data?.history || [];
    if (!rows.length) {
      historyBox.replaceChildren(h('p', { class: 'muted', text: 'هنوز پرونده‌ای تمرین نکرده‌اید.' }));
      return;
    }
    historyBox.replaceChildren(
      h('h2', { text: 'سوابق من' }),
      h('ul', { class: 'moot-history-list' }, rows.map((row) => {
        const c = titles.get(row.case_slug);
        const label = c ? c.title : row.case_slug;
        const cta = c
          ? h('a', { class: 'btn btn-ghost', href: `#/moot-court/hearing?case=${encodeURIComponent(row.case_slug)}`, text: 'ادامه با این پرونده' })
          : h('span', { class: 'muted', text: 'این پرونده دیگر منتشر نیست' });
        return h('li', {}, [
          h('strong', { text: label }),
          h('span', { class: 'muted', text: ` · انتخاب ${row.selections || 0} بار · تکمیل ${row.completions || 0} بار` }),
          cta,
        ]);
      })),
    );
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(loadList, SEARCH_DELAY_MS);
  });
  area.addEventListener('change', loadList);
  difficulty.addEventListener('change', loadList);
  rotate.addEventListener('click', loadSuggestions);

  body.append(
    h('h2', { text: 'پیشنهاد برای امروز' }),
    h('div', { class: 'moot-suggest-head' }, [rotate]),
    suggestionsBox,
    h('h2', { text: 'همهٔ پرونده‌ها' }),
    filters,
    listBox,
    historyBox,
  );

  (async () => {
    const me = await getJson('/api/me');
    loggedIn = Boolean(me.ok);
    if (!loggedIn) {
      historyBox.replaceChildren(notice('برای شروع جلسه و ثبت سوابق، ابتدا وارد حساب خود شوید.'));
    }
    await Promise.all([loadSuggestions(), loadList(), loggedIn ? loadHistory() : Promise.resolve()]);
  })();

  return body;
}
