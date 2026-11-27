// انتخاب پرونده از بانک مشترک و ثبت تمرین‌های مستقل هر کارگاه.
import { getJson, postJson } from './api.js';

function node(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') el.textContent = value;
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value);
  }
  for (const child of children) el.append(child);
  return el;
}

export function academyCaseBank(courseId, lessonId) {
  const section = node('section', { class: 'academy-case-bank panel', 'aria-label': 'انتخاب پرونده از بانک پرونده‌ها' });
  const heading = node('h3', { text: 'انتخاب پرونده از بانک مشترک' });
  const intro = node('p', { class: 'muted', text: 'هر تعداد پرونده منتشرشده را می‌توانید برای این درس انتخاب کنید. تمرین و سوابق هر پرونده جداگانه در بایگانی شما ذخیره می‌شود.' });
  const search = node('input', { type: 'search', maxlength: '100', placeholder: 'جست‌وجو در عنوان، موضوع یا حوزه پرونده' });
  const searchButton = node('button', { type: 'button', class: 'btn btn-outline', text: 'جست‌وجو' });
  const results = node('div', { class: 'academy-case-bank-results', 'aria-live': 'polite' });
  const pager = node('div', { class: 'academy-case-bank-pager' });
  const detail = node('div', { class: 'academy-case-bank-detail' });
  const history = node('div', { class: 'academy-case-practice-history' });
  let page = 1, selectedCase = null, total = 0, loading = false, initialized = false, historyPage = 1;

  async function loadCases(nextPage = 1) {
    if (loading) return;
    loading = true; page = nextPage;
    results.replaceChildren(node('p', { class: 'muted', text: 'در حال دریافت پرونده‌ها…' }));
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search.value.trim()) params.set('q', search.value.trim());
    const response = await getJson('/api/cases?' + params.toString());
    loading = false;
    if (!response.ok) {
      results.replaceChildren(node('p', { class: 'form-status err', text: 'دریافت بانک پرونده‌ها با خطا روبه‌رو شد؛ دوباره تلاش کنید.' }));
      pager.replaceChildren(); return;
    }
    total = Number(response.data.total || 0);
    results.replaceChildren();
    if (!response.data.cases?.length) results.append(node('p', { class: 'notice', text: 'پرونده‌ای با این مشخصات پیدا نشد.' }));
    for (const item of response.data.cases || []) {
      const button = node('button', { type: 'button', class: 'academy-case-choice', text: item.title + ' · ' + (item.area || 'حوزه نامشخص') });
      button.addEventListener('click', () => loadDetail(item.id));
      results.append(button);
    }
    pager.replaceChildren(
      node('span', { class: 'muted', text: 'مجموع پرونده‌های منطبق: ' + total.toLocaleString('fa-IR') }),
      node('button', { type: 'button', class: 'btn btn-outline', text: 'صفحه قبل' }),
      node('span', { text: 'صفحه ' + page.toLocaleString('fa-IR') }),
      node('button', { type: 'button', class: 'btn btn-outline', text: 'صفحه بعد' })
    );
    const buttons = pager.querySelectorAll('button');
    buttons[0].disabled = page <= 1;
    buttons[1].disabled = page * 20 >= total;
    buttons[0].addEventListener('click', () => loadCases(page - 1));
    buttons[1].addEventListener('click', () => loadCases(page + 1));
  }

  async function loadDetail(caseId) {
    detail.replaceChildren(node('p', { class: 'muted', text: 'در حال بارگذاری پرونده…' }));
    const response = await getJson('/api/cases/' + encodeURIComponent(caseId));
    if (!response.ok) {
      detail.replaceChildren(node('p', { class: 'form-status err', text: 'متن پرونده در دسترس نیست.' }));
      return;
    }
    selectedCase = response.data.case;
    const c = selectedCase;
    const body = node('div', { class: 'academy-case-detail-body' }, [
      node('h4', { text: c.title }),
      node('p', { text: 'موضوع: ' + (c.subject || '—') }),
      node('p', { text: 'خواسته: ' + (c.request || '—') }),
      node('h5', { text: 'شرح وقایع' }),
      node('p', { class: 'pre-wrap', text: c.facts || '—' }),
      node('h5', { text: 'مسائل قابل بررسی' }),
      node('ul', {}, (c.issues || []).map(x => node('li', { text: typeof x === 'string' ? x : (x.title || x.issue || JSON.stringify(x)) }))),
      node('h5', { text: 'اسناد پرونده' }),
      node('ul', {}, (c.documents || []).map(x => node('li', { text: (x.title || 'سند') + ' — ' + (x.summary || '') })))
    ]);
    const answer = node('textarea', { rows: '5', maxlength: '12000', placeholder: 'تحلیل، راهبرد یا پیش‌نویس خود را برای این پرونده بنویسید…' });
    const save = node('button', { type: 'button', class: 'btn', text: 'ذخیره تمرین در بایگانی کارگاه' });
    const status = node('p', { class: 'form-status', role: 'status' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      const result = await postJson('/api/cases/workshop-practices', { courseId, lessonId, caseId: c.id, responseText: answer.value });
      save.disabled = false;
      if (!result.ok) { status.className = 'form-status err'; status.textContent = result.data?.message || 'ذخیره تمرین انجام نشد.'; return; }
      status.className = 'form-status success';
      status.textContent = result.data.status === 'submitted' ? 'تمرین ثبت شد.' : 'پیش‌نویس تمرین ذخیره شد؛ با تکمیل متن می‌توانید آن را ثبت کنید.';
      await loadHistory();
    });
    detail.replaceChildren(body, node('label', { class: 'academy-answer-label' }, [node('span', { text: 'یادداشت و تحلیل پرونده' }), answer]), save, status);
  }

  async function loadHistory(nextPage = 1) {
    historyPage = nextPage;
    const params = new URLSearchParams({ courseId, lessonId, page: String(historyPage), pageSize: '20' });
    const response = await getJson('/api/cases/workshop-practices?' + params.toString());
    history.replaceChildren(node('h4', { text: 'بایگانی تمرین‌های این درس' }));
    if (!response.ok) { history.append(node('p', { class: 'muted', text: 'سوابق تمرین فعلاً قابل دریافت نیست.' })); return; }
    if (!response.data.practices?.length) { history.append(node('p', { class: 'muted', text: 'هنوز تمرینی برای این درس ثبت نشده است.' })); return; }
    for (const item of response.data.practices) {
      const card = node('article', { class: 'academy-case-practice-item' }, [
        node('strong', { text: item.case_title || item.case_id }),
        node('span', { class: 'badge', text: item.status === 'submitted' ? 'ثبت‌شده' : 'پیش‌نویس' }),
        node('p', { class: 'pre-wrap', text: item.response_text || 'بدون یادداشت' })
      ]);
      history.append(card);
    }
    if (response.data.total > 20) {
      const nav = node('div', { class: 'academy-case-bank-pager' });
      const previous = node('button', { type: 'button', class: 'btn btn-outline', text: 'سوابق جدیدتر' });
      const next = node('button', { type: 'button', class: 'btn btn-outline', text: 'سوابق قدیمی‌تر' });
      previous.disabled = historyPage <= 1; next.disabled = !response.data.hasMore;
      previous.addEventListener('click', () => loadHistory(historyPage - 1));
      next.addEventListener('click', () => loadHistory(historyPage + 1));
      nav.append(previous, node('span', { text: 'صفحه ' + historyPage.toLocaleString('fa-IR') }), next);
      history.append(nav);
    }
  }

  searchButton.addEventListener('click', () => loadCases(1));
  search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); loadCases(1); } });
  const content = node('div', { class: 'academy-case-bank-content' }, [
    heading, intro, node('div', { class: 'academy-case-bank-search' }, [search, searchButton]), results, pager, detail, history
  ]);
  const disclosure = node('details', { class: 'academy-case-bank-disclosure' }, [
    node('summary', { text: 'انتخاب پرونده و بایگانی تمرین‌های این درس' }), content
  ]);
  disclosure.addEventListener('toggle', () => {
    if (disclosure.open && !initialized) {
      initialized = true;
      loadCases();
      loadHistory();
    }
  });
  section.append(disclosure);
  return section;
}
