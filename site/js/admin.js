// رابط مدیریت محتوا برای مدیران؛ تمام داده‌ها با textContent در DOM درج می‌شوند.
import { getJson, postJson, sendJson } from './api.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}
function field(labelText, name, value = '', type = 'text', required = true) {
  const label = el('label', { class: 'admin-field' }, [el('span', { text: labelText })]);
  const control = type === 'textarea' ? el('textarea', { name, rows: name === 'summary' ? '3' : '6', required: String(required) }) : el('input', { name, type, required: String(required) });
  control.value = value;
  label.append(control);
  return label;
}
function lineList(items = []) { return items.join('\n'); }
function parseLines(value) { return value.split('\n').map((x) => x.trim()).filter(Boolean); }
function errorText(data, status) {
  if (status === 401) return 'برای مدیریت محتوا ابتدا وارد حساب کاربری شوید.';
  if (status === 403) return 'این حساب نقش مدیر ندارد. دسترسی مدیریت فقط از طریق نقش مدیر مجاز است.';
  if (data?.error === 'DUPLICATE_LAW') return 'این شناسه قبلاً برای یک قانون ثبت شده است.';
  if (data?.error === 'DUPLICATE_RELATION') return 'این رابطه حقوقی قبلاً ثبت شده است.';
  if (data?.error === 'STATUS_EVIDENCE_REQUIRED') return 'برای ثبت اصلاح یا نسخ، توضیح و مشخصات منبع را وارد کنید.';
  if (data?.error === 'INVALID_SOURCE_URL') return 'نشانی منبع باید با https شروع شود.';
  if (data?.error === 'DUPLICATE_SLUG') return 'این شناسه قبلاً برای همین نوع محتوا استفاده شده است.';
  if (data?.error === 'UNPUBLISH_BEFORE_DELETE') return 'ابتدا محتوا را از انتشار خارج کنید و سپس آن را حذف کنید.';
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  return 'عملیات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
}

export async function adminPage() {
  const wrap = el('div', {}, [
    el('span', { class: 'section-kicker', text: 'ویژهٔ مدیران مجاز' }),
    el('h1', { text: 'پنل مدیریت محتوا' }),
    el('p', { class: 'lead', text: 'از منوی مدیریت، بخش موردنیاز را انتخاب کنید. نمای اصلی فقط گزارش کلی و وضعیت بخش‌ها را نمایش می‌دهد.' }),
  ]);
  const notice = el('p', { class: 'form-status', role: 'status' });
  const list = el('div', { class: 'admin-content-list' });
  const form = el('form', { class: 'admin-form card' });
  let editingId = null;
  let currentItems = [];
  const select = el('select', { name: 'kind', required: 'true', 'aria-label': 'نوع محتوا' }, [
    el('option', { value: 'course', text: 'دورهٔ آموزشی' }),
    el('option', { value: 'case', text: 'پروندهٔ آموزشی' }),
  ]);
  const statusSelect = el('select', { name: 'status', required: 'true', 'aria-label': 'وضعیت انتشار' }, [
    el('option', { value: 'draft', text: 'پیش‌نویس' }), el('option', { value: 'published', text: 'منتشرشده' }),
  ]);
  const kindLabel = el('label', { class: 'admin-field' }, [el('span', { text: 'نوع محتوا' }), select]);
  const statusLabel = el('label', { class: 'admin-field' }, [el('span', { text: 'وضعیت' }), statusSelect]);
  const slugField = field('شناسهٔ انگلیسی (مانند contract-basics)', 'slug');
  const titleField = field('عنوان', 'title');
  const summaryField = field('خلاصه (۱۰ تا ۵۰۰ نویسه)', 'summary', '', 'textarea');
  const levelField = field('سطح (مثلاً مقدماتی)', 'level', 'مقدماتی');
  const areaField = field('حوزهٔ پرونده (مثلاً قراردادها)', 'area', 'قراردادها');
  const lessonsField = field('درس‌ها؛ هر خط با قالب شناسه|عنوان|متن درس (حداقل ۲۰ نویسه)', 'lessons', '', 'textarea');
  const factsField = field('وقایع پرونده؛ هر خط یک واقعه', 'facts', '', 'textarea');
  const issuesField = field('مسائل؛ هر خط با قالب شناسه|صورت مسئله', 'issues', '', 'textarea');
  const evidenceField = field('مدارک بالقوه؛ هر خط یک مدرک', 'evidence', '', 'textarea');
  // پروندهٔ بانک به‌صورت کامل (JSON) ویرایش می‌شود تا هیچ بخشی (شاهد، رأی، استنادها) از دست نرود.
  const caseJsonField = field('پروندهٔ کامل بانک (JSON مطابق ساختار بانک پرونده‌ها؛ شناسه باید با slug یکسان باشد)', 'caseJson', '', 'textarea');
  caseJsonField.querySelector('textarea').rows = 18;
  caseJsonField.querySelector('textarea').spellcheck = false;
  const submit = el('button', { class: 'btn', type: 'submit', text: 'ذخیرهٔ محتوا' });
  const cancel = el('button', { class: 'btn secondary', type: 'button', text: 'لغو ویرایش' });
  cancel.hidden = true;
  const formActions = el('div', { class: 'row' }, [submit, cancel]);
  form.append(kindLabel, slugField, titleField, summaryField, statusLabel, levelField, lessonsField, areaField, factsField, issuesField, evidenceField, caseJsonField, formActions);
  // بارگذاری دوره‌های داخلی و بانک پرونده‌ها به‌صورت پیش‌نویس؛ هیچ‌کدام منتشر نمی‌شوند.
  const importNotice = el('p', { class: 'form-status', role: 'status' });
  const importStatus = el('p', { class: 'muted', role: 'status' });
  async function refreshImportStatus() {
    const r = await getJson('/api/admin/cases/status');
    if (!r.ok) { importStatus.textContent = ''; return; }
    const d = r.data;
    importStatus.textContent = `بانک: ${d.bankTotal} پرونده · در پایگاه داده: ${d.dbTotal} · پیش‌نویس: ${d.counts.draft || 0} · منتشرشده: ${d.counts.published || 0} · استناد تأییدشده: ${d.verifiedRefs} · سالم: ${d.intact}${d.missing.length ? ` · ناقص: ${d.missing.length}` : ''}`;
  }
  const importCourses = el('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری دوره‌های داخلی (پیش‌نویس)' });
  importCourses.addEventListener('click', async () => {
    const r = await postJson('/api/admin/courses/import-builtin', {});
    importNotice.className = `form-status${r.ok ? '' : ' err'}`;
    importNotice.textContent = r.ok ? `دوره‌ها: ${r.data.inserted} افزوده، ${r.data.skippedExisting} موجود (بدون بازنویسی).` : errorText(r.data, r.status);
    if (r.ok) await refresh();
  });
  const importCases = el('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری سناریوهای فرضی بانک تمرین' });
  importCases.addEventListener('click', async () => {
    
    const r = await postJson('/api/admin/cases/import', {});
    importNotice.className = `form-status${r.ok ? '' : ' err'}`;
    importNotice.textContent = r.ok ? `پرونده‌ها: ${r.data.inserted} افزوده، ${r.data.skippedExisting} موجود (بدون بازنویسی).` : errorText(r.data, r.status);
    if (r.ok) { await refresh(); await refreshImportStatus(); }
  });
  const importPanel = el('section', { class: 'admin-import card' }, [
    el('h2', { text: 'بارگذاری محتوای داخلی' }),
    el('p', { class: 'muted', text: 'بانک شامل سناریوهای فرضی تمرین دادرسی است، نه متن رأی واقعی. این سناریوها با برچسب آموزشی منتشر می‌شوند؛ استنادهای بررسی‌نشده بدون شماره ماده نمایش داده می‌شوند. هفت دورهٔ تکمیلی آکادمی نیز در فهرست عمومی فعال‌اند.' }),
    el('div', { class: 'row' }, [importCourses, importCases]),
    importStatus,
    importNotice,
  ]);
  // تشخیص ارسال ایمیل (فقط مدیر سامانه): وضعیت Secretها، بررسی توکن Gmail و ایمیل آزمایشی.
  const mailNotice = el('p', { class: 'form-status', role: 'status' });
  const mailCheck = el('button', { class: 'btn secondary', type: 'button', text: 'بررسی تنظیمات ایمیل' });
  mailCheck.addEventListener('click', async () => {
    mailNotice.className = 'form-status';
    mailNotice.textContent = 'در حال بررسی…';
    const r = await getJson('/api/admin/mail/status?probe=1');
    if (!r.ok) { mailNotice.className = 'form-status err'; mailNotice.textContent = errorText(r.data, r.status); return; }
    const d = r.data;
    const bad = !d.configured || (d.probe && !d.probe.ok);
    mailNotice.className = `form-status${bad ? ' err' : ' ok'}`;
    mailNotice.textContent = bad
      ? `مشکل ایمیل: ${d.hint || d.probe?.hint || 'نامشخص'}`
      : `تنظیمات ایمیل کامل است و توکن Gmail معتبر است. آدرس پایه لینک‌ها: ${d.baseUrl}`;
  });
  const mailTest = el('button', { class: 'btn secondary', type: 'button', text: 'ارسال ایمیل آزمایشی به خودم' });
  mailTest.addEventListener('click', async () => {
    mailNotice.className = 'form-status';
    mailNotice.textContent = 'در حال ارسال…';
    const r = await postJson('/api/admin/mail/test', {});
    mailNotice.className = `form-status${r.ok ? ' ok' : ' err'}`;
    mailNotice.textContent = r.ok ? 'ایمیل آزمایشی ارسال شد؛ صندوق ورودی و Spam را ببینید.' : `ارسال ناموفق: ${r.data?.hint || errorText(r.data, r.status)}`;
  });
  const aiNotice = el('p', { class: 'form-status', role: 'status' });
  const aiCheck = el('button', { class: 'btn secondary', type: 'button', text: 'بررسی سرویس هوش مصنوعی' });
  aiCheck.addEventListener('click', async () => {
    aiNotice.className = 'form-status';
    aiNotice.textContent = 'در حال بررسی مدل‌ها…';
    const r = await getJson('/api/admin/ai/status');
    if (!r.ok) { aiNotice.className = 'form-status err'; aiNotice.textContent = errorText(r.data, r.status); return; }
    const lines = (r.data.models || []).map((m) => `${m.role} (${m.model}): ${m.hint}${m.httpStatus ? ` [HTTP ${m.httpStatus}${m.reason ? ` ${m.reason}` : ''}]` : ''}${m.ms ? ` · ${m.ms}ms` : ''}`);
    const g = r.data.groq;
    if (g) lines.push(`بازبین Groq: ${g.hint}${g.httpStatus ? ` [HTTP ${g.httpStatus}]` : ''}${g.ms ? ` · ${g.ms}ms` : ''}${g.models ? ` · ${g.models.map((m) => `${m.id}: ${m.available ? 'موجود' : 'نامشخص'}`).join('، ')}` : ''}`);
    const bad = !r.data.configured || (r.data.models || []).every((m) => !m.ok);
    aiNotice.className = `form-status${bad ? ' err' : ' ok'}`;
    aiNotice.textContent = r.data.configured ? lines.join(' | ') : `GEMINI_API_KEY در Worker تعریف نشده است.${g ? ` | بازبین Groq: ${g.hint}` : ''}`;
  });
  const mailPanel = el('section', { class: 'admin-mail card' }, [
    el('h2', { text: 'تشخیص ارسال ایمیل' }),
    el('p', { class: 'muted', text: 'اگر ایمیل تأیید ثبت‌نام نمی‌رسد، از این‌جا علت را ببینید. مقدار Secretها هرگز نمایش داده نمی‌شود.' }),
    el('div', { class: 'row' }, [mailCheck, mailTest]),
    mailNotice,
    el('h2', { text: 'تشخیص هوش مصنوعی' }),
    el('div', { class: 'row' }, [aiCheck]),
    aiNotice,
  ]);
  // جست‌وجو در فهرست محتوا (عنوان، شناسه، وضعیت)
  const search = el('input', { type: 'search', placeholder: 'جست‌وجو در عنوان، شناسه یا وضعیت', 'aria-label': 'جست‌وجو در محتوا' });
  search.addEventListener('input', () => {
    const q = search.value.trim();
    for (const row of list.children) row.hidden = Boolean(q) && !(row.dataset.search || '').includes(q);
  });
  const contentView = el('section', { class: 'admin-view card', 'data-admin-view': 'content', hidden: 'hidden' }, [
    el('h2', { text: 'مدیریت دوره‌ها و پرونده‌ها' }), notice, form,
    el('h3', { text: 'محتواهای ثبت‌شده' }), search, list,
  ]);
  const dashboardView = el('section', { class: 'admin-view admin-dashboard-view', 'data-admin-view': 'dashboard' });
  const importView = el('section', { class: 'admin-view', 'data-admin-view': 'imports', hidden: 'hidden' }, [importPanel]);
  const mediaView = el('section', { class: 'admin-view', 'data-admin-view': 'media', hidden: 'hidden' });
  const servicesView = el('section', { class: 'admin-view', 'data-admin-view': 'services', hidden: 'hidden' }, [mailPanel]);

  function showKindFields() {
    const isCourse = select.value === 'course';
    lessonsField.hidden = !isCourse;
    areaField.hidden = isCourse;
    factsField.hidden = isCourse;
    issuesField.hidden = isCourse;
    evidenceField.hidden = isCourse;
    caseJsonField.hidden = isCourse;
    levelField.hidden = !isCourse;
    caseJsonField.querySelector('textarea').required = !isCourse;
    lessonsField.querySelector('textarea').required = isCourse;
    areaField.querySelector('input').required = !isCourse;
    factsField.querySelector('textarea').required = !isCourse;
    issuesField.querySelector('textarea').required = !isCourse;
    evidenceField.querySelector('textarea').required = !isCourse;
  }
  function resetForm() {
    editingId = null;
    select.disabled = false;
    form.reset(); statusSelect.value = 'draft'; levelField.querySelector('input').value = 'مقدماتی'; areaField.querySelector('input').value = 'قراردادها';
    lessonsField.querySelector('textarea').value = ''; factsField.querySelector('textarea').value = ''; issuesField.querySelector('textarea').value = ''; evidenceField.querySelector('textarea').value = ''; caseJsonField.querySelector('textarea').value = '';
    submit.textContent = 'ذخیرهٔ محتوا'; cancel.hidden = true; showKindFields();
  }
  function payloadFromForm() {
    if (select.value === 'course') {
      const lessons = parseLines(lessonsField.querySelector('textarea').value).map((line) => {
        const [id, title, ...body] = line.split('|'); return { id: (id || '').trim(), title: (title || '').trim(), body: body.join('|').trim() };
      });
      return { level: levelField.querySelector('input').value.trim(), lessons };
    }
    const issues = parseLines(issuesField.querySelector('textarea').value).map((line) => {
      const [id, ...text] = line.split('|'); return { id: (id || '').trim(), text: text.join('|').trim() };
    });
    // پروندهٔ بانک: JSON کامل؛ خطای قالب همین‌جا گزارش می‌شود و به سرور ارسال نمی‌شود.
    const raw = caseJsonField.querySelector('textarea').value;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('JSON پرونده معتبر نیست؛ ساختار را بررسی کنید.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON پرونده باید یک شیء باشد.');
    return parsed;
  }
  async function refresh() {
    const result = await getJson('/api/admin/content');
    if (!result.ok) { notice.className = 'form-status err'; notice.textContent = errorText(result.data, result.status); form.hidden = true; list.replaceChildren(); return; }
    form.hidden = false; notice.textContent = `${result.data.items.length} محتوا دریافت شد.`; notice.className = 'form-status'; currentItems = result.data.items; list.replaceChildren();
    if (!currentItems.length) list.append(el('p', { class: 'muted', text: 'هنوز محتوایی ثبت نشده است.' }));
    for (const item of currentItems) {
      const statusText = item.status === 'published' ? 'منتشرشده' : (item.payload?.review_status || 'پیش‌نویس');
      const row = el('article', { class: 'admin-content-row card' }, [
        el('div', {}, [el('span', { class: 'badge', text: `${item.kind === 'course' ? 'دوره' : 'پرونده'} · ${statusText}` }), el('h3', { text: item.title }), el('p', { class: 'muted', text: `${item.slug} — ${item.summary}` })]),
      ]);
      const actions = el('div', { class: 'row admin-actions' });
      const edit = el('button', { class: 'btn secondary', type: 'button', text: 'ویرایش' });
      edit.addEventListener('click', () => {
        editingId = item.id; select.value = item.kind; select.disabled = true; slugField.querySelector('input').value = item.slug; titleField.querySelector('input').value = item.title; summaryField.querySelector('textarea').value = item.summary; statusSelect.value = item.status;
        levelField.querySelector('input').value = item.payload.level || 'مقدماتی';
        if (item.kind === 'course') lessonsField.querySelector('textarea').value = lineList((item.payload.lessons || []).map((x) => `${x.id}|${x.title}|${x.body}`));
        else { caseJsonField.querySelector('textarea').value = JSON.stringify(item.payload?.id ? item.payload : { ...item.payload, id: item.slug }, null, 2); }
        submit.textContent = 'ثبت تغییرات'; cancel.hidden = false; showKindFields(); form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const toggle = el('button', { class: 'btn secondary', type: 'button', text: item.status === 'published' ? 'خروج از انتشار' : 'انتشار' });
      toggle.addEventListener('click', async () => {
        const result = await sendJson('PATCH', `/api/admin/content/${item.id}`, { status: item.status === 'published' ? 'draft' : 'published' });
        notice.className = `form-status${result.ok ? '' : ' err'}`; notice.textContent = result.ok ? 'وضعیت انتشار تغییر کرد.' : errorText(result.data, result.status); if (result.ok) await refresh();
      });
      actions.append(edit, toggle);
      if (item.status === 'draft') {
        const remove = el('button', { class: 'btn danger', type: 'button', text: 'حذف پیش‌نویس' });
        remove.addEventListener('click', async () => {
          if (!window.confirm('این پیش‌نویس حذف شود؟')) return;
          const result = await sendJson('DELETE', `/api/admin/content/${item.id}`);
          notice.className = `form-status${result.ok ? '' : ' err'}`; notice.textContent = result.ok ? 'پیش‌نویس حذف شد.' : errorText(result.data, result.status); if (result.ok) await refresh();
        });
        actions.append(remove);
      }
      row.dataset.search = `${item.title} ${item.slug} ${statusText}`;
      row.append(actions); list.append(row);
    }
  }
  select.addEventListener('change', showKindFields);
  cancel.addEventListener('click', resetForm);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let body;
    try {
      body = { kind: select.value, slug: slugField.querySelector('input').value.trim(), title: titleField.querySelector('input').value.trim(), summary: summaryField.querySelector('textarea').value.trim(), status: statusSelect.value, payload: payloadFromForm() };
    } catch (error) {
      notice.className = 'form-status err'; notice.textContent = error.message; return;
    }
    const result = editingId ? await sendJson('PATCH', `/api/admin/content/${editingId}`, body) : await postJson('/api/admin/content', body);
    notice.className = `form-status${result.ok ? '' : ' err'}`;
    notice.textContent = result.ok ? (editingId ? 'محتوا به‌روزرسانی شد.' : 'محتوا ثبت شد.') : errorText(result.data, result.status);
    if (result.ok) { resetForm(); await refresh(); }
  });
  // بانک قوانین: ورود گروهی متن و بازبینی وضعیت هر سند.
  const legalBankNotice = el('p', { class: 'form-status', role: 'status' });
  const legalBankJson = field('اطلاعات قانون و مواد به قالب JSON (متن کامل هر ماده)', 'legalBankJson', '', 'textarea');
  legalBankJson.querySelector('textarea').rows = 20;
  legalBankJson.querySelector('textarea').spellcheck = false;
  const legalBankFile = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'انتخاب فایل JSON قانون' });
  const legalBankFileField = el('label', { class: 'admin-field' }, [
    el('span', { text: 'یا فایل JSON قانون را انتخاب کن' }),
    legalBankFile,
    el('small', { class: 'muted', text: 'حداکثر ۴ مگابایت؛ فایل فقط در مرورگر خوانده می‌شود و پس از بارگذاری، محتوایش برای بررسی در کادر بالا قرار می‌گیرد.' }),
  ]);
  legalBankFile.addEventListener('change', async () => {
    const file = legalBankFile.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      legalBankNotice.className = 'form-status err';
      legalBankNotice.textContent = 'حجم فایل بیش از ۴ مگابایت است.';
      legalBankFile.value = '';
      return;
    }
    try {
      const raw = await file.text();
      JSON.parse(raw);
      legalBankJson.querySelector('textarea').value = raw;
      legalBankNotice.className = 'form-status';
      legalBankNotice.textContent = 'فایل خوانده شد؛ اطلاعات را بررسی کن و سپس ثبت قانون را بزن.';
    } catch {
      legalBankNotice.className = 'form-status err';
      legalBankNotice.textContent = 'فایل انتخاب‌شده JSON معتبر نیست.';
    }
  });
  const legalBankSubmit = el('button', { class: 'btn', type: 'submit', text: 'ثبت قانون در وضعیت نیازمند بررسی' });
  const legalBankForm = el('form', { class: 'admin-form card' }, [
    el('p', { class: 'muted', text: 'هر سند ابتدا در وضعیت «نیازمند بررسی» ثبت می‌شود و تا تأیید مدیر در پاسخ دستیار استفاده نخواهد شد. متن را از منبع رسمی و همراه با اصلاحات وارد کنید.' }),
    legalBankFileField, legalBankJson, legalBankSubmit,
  ]);
  const legalBankList = el('div', { class: 'admin-content-list' });
  async function refreshLegalBank() {
    const r = await getJson('/api/admin/legal-bank/list');
    if (!r.ok) { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = errorText(r.data, r.status); legalBankList.replaceChildren(); return; }
    legalBankNotice.className = 'form-status'; legalBankNotice.textContent = `${r.data.items.length} سند در بانک ثبت شده است.`;
    legalBankList.replaceChildren();
    if (!r.data.items.length) legalBankList.append(el('p', { class: 'muted', text: 'هنوز قانونی ثبت نشده است.' }));
    for (const item of r.data.items) {
      const statusLabels = { needs_review: 'نیازمند بررسی', verified: 'تأییدشده', amended: 'اصلاح‌شده', repealed: 'منسوخ' };
      const row = el('article', { class: 'admin-content-row card' }, [
        el('div', {}, [
          el('span', { class: 'badge', text: statusLabels[item.status] || item.status }),
          el('h3', { text: item.title }),
          el('p', { class: 'muted', text: `${item.articleCount} ماده · ${item.verifiedArticles || 0} ماده تأییدشده · ${item.slug}` }),
          el('p', { class: 'muted', text: item.sourceName || 'منبع ثبت نشده' }),
        ]),
      ]);
      const status = el('select', { 'aria-label': `وضعیت ${item.title}` }, [
        el('option', { value: 'needs_review', text: 'نیازمند بررسی' }),
        el('option', { value: 'verified', text: 'تأییدشده' }),
        el('option', { value: 'amended', text: 'اصلاح‌شده' }),
        el('option', { value: 'repealed', text: 'منسوخ' }),
      ]);
      status.value = item.status;
      status.addEventListener('change', async () => {
        const r = await sendJson('PATCH', '/api/admin/legal-bank/status', { lawId: item.id, status: status.value });
        legalBankNotice.className = `form-status${r.ok ? '' : ' err'}`;
        legalBankNotice.textContent = r.ok ? 'وضعیت سند تغییر کرد؛ وضعیت مواد بدون تغییر باقی ماند.' : errorText(r.data, r.status);
        if (r.ok) await refreshLegalBank();
      });
      const manage = el('button', { class: 'btn secondary', type: 'button', text: 'مدیریت مواد' });
      const articlePanel = el('div', { class: 'admin-content-list', hidden: 'hidden' });
      manage.addEventListener('click', async () => {
        if (!articlePanel.hidden) { articlePanel.hidden = true; manage.textContent = 'مدیریت مواد'; return; }
        manage.disabled = true;
        const result = await getJson(`/api/admin/legal-bank/articles?lawId=${item.id}`);
        manage.disabled = false;
        if (!result.ok) { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = errorText(result.data, result.status); return; }
        articlePanel.replaceChildren();
        const relationLabels = { amends: 'اصلاح می‌کند', repeals: 'نسخ می‌کند', replaces: 'جایگزین می‌کند', interprets: 'تفسیر می‌کند' };
        for (const article of result.data.items) {
          const articleRelations = (result.data.relations || []).filter((r) => r.authorityArticleId === article.id || r.affectedArticleId === article.id);
          const relationSummary = articleRelations.map((r) => `ماده ${r.authorityArticleNumber} ${relationLabels[r.relationType]} ماده ${r.affectedArticleNumber}${r.effectiveDate ? ' از ' + r.effectiveDate : ''}${r.sourceNote ? ' — ' + r.sourceNote : ''}`);

          const heading = el('h4', { text: `ماده ${article.number} · شناسه ${article.id}${article.heading ? ' ـ ' + article.heading : ''}` });
          const statusSelect = el('select', { 'aria-label': `وضعیت ماده ${article.number}` }, [
            el('option', { value: 'needs_review', text: 'نیازمند بررسی' }),
            el('option', { value: 'verified', text: 'تأییدشده' }),
            el('option', { value: 'amended', text: 'اصلاح‌شده' }),
            el('option', { value: 'repealed', text: 'منسوخ' }),
          ]);
          statusSelect.value = article.status;
          const note = el('textarea', { rows: '2', placeholder: 'توضیح وضعیت یا مستند اصلاح/نسخ' });
          note.value = article.statusNote || '';
          const sourceName = el('input', { type: 'text', placeholder: 'نام منبع اصلاح یا نسخ' });
          sourceName.value = article.statusSourceName || '';
          const sourceUrl = el('input', { type: 'url', placeholder: 'نشانی منبع (HTTPS)' });
          sourceUrl.value = article.statusSourceUrl || '';
          const effectiveDate = el('input', { type: 'text', placeholder: 'تاریخ اثر YYYY-MM-DD' });
          effectiveDate.value = article.statusEffectiveDate || '';
          const save = el('button', { class: 'btn', type: 'button', text: 'ذخیره وضعیت ماده' });
          save.addEventListener('click', async () => {
            save.disabled = true;
            const saved = await sendJson('PATCH', '/api/admin/legal-bank/article-status', {
              articleId: article.id, status: statusSelect.value, statusNote: note.value,
              statusSourceName: sourceName.value, statusSourceUrl: sourceUrl.value, statusEffectiveDate: effectiveDate.value,
            });
            save.disabled = false;
            legalBankNotice.className = `form-status${saved.ok ? '' : ' err'}`;
            legalBankNotice.textContent = saved.ok ? `وضعیت ماده ${article.number} ذخیره شد.` : errorText(saved.data, saved.status);
          });
          const relationTitle = el('p', { class: 'muted', text: 'ثبت رابطه با ماده‌ای دیگر (شناسه داخلی ماده را وارد کنید)' });
          const targetId = el('input', { type: 'number', min: '1', placeholder: 'شناسه داخلی ماده مرتبط' });
          const relationType = el('select', { 'aria-label': 'نوع رابطه' }, [
            el('option', { value: 'amends', text: 'اصلاح می‌کند' }),
            el('option', { value: 'repeals', text: 'نسخ می‌کند' }),
            el('option', { value: 'replaces', text: 'جایگزین می‌کند' }),
            el('option', { value: 'interprets', text: 'تفسیر می‌کند' }),
          ]);
          const relationNote = el('input', { type: 'text', placeholder: 'مستند و توضیح رابطه' });
          const relationDate = el('input', { type: 'text', placeholder: 'تاریخ اثر YYYY-MM-DD (اختیاری)' });
          const relationSave = el('button', { class: 'btn secondary', type: 'button', text: 'ثبت رابطه' });
          relationSave.addEventListener('click', async () => {
            const relatedId = Number(targetId.value);
            if (!Number.isInteger(relatedId) || relatedId < 1) { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = 'شناسه داخلی ماده مرتبط را وارد کنید.'; return; }
            relationSave.disabled = true;
            const saved = await postJson('/api/admin/legal-bank/relations', {
              affectedArticleId: relatedId, authorityArticleId: article.id,
              relationType: relationType.value, sourceNote: relationNote.value, effectiveDate: relationDate.value,
            });
            relationSave.disabled = false;
            legalBankNotice.className = `form-status${saved.ok ? '' : ' err'}`;
            legalBankNotice.textContent = saved.ok ? 'رابطه حقوقی ثبت شد.' : errorText(saved.data, saved.status);
          });
          articlePanel.append(el('article', { class: 'admin-content-row card' }, [
            heading, el('p', { class: 'muted', text: article.body.slice(0, 420) + (article.body.length > 420 ? '…' : '') }),
            ...(relationSummary.length ? [el('p', { class: 'muted', text: relationSummary.join(' | ') })] : []),
            statusSelect, note, sourceName, sourceUrl, effectiveDate, save, relationTitle, targetId, relationType, relationNote, relationDate, relationSave,
          ]));
        }
        articlePanel.hidden = false;
        manage.textContent = 'بستن مواد';
      });
      row.append(el('div', { class: 'row admin-actions' }, [status, manage]));
      row.append(articlePanel);
      legalBankList.append(row);
    }
  }
  legalBankForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    let payload;
    try { payload = JSON.parse(legalBankJson.querySelector('textarea').value); }
    catch { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = 'ساختار JSON معتبر نیست.'; return; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = 'اطلاعات قانون باید یک شیء JSON باشد.'; return;
    }
    legalBankSubmit.disabled = true;
    const r = await postJson('/api/admin/legal-bank/import', payload);
    legalBankSubmit.disabled = false;
    legalBankNotice.className = `form-status${r.ok ? '' : ' err'}`;
    legalBankNotice.textContent = r.ok ? `قانون با ${r.data.articles} ماده در وضعیت نیازمند بررسی ثبت شد.` : errorText(r.data, r.status);
    if (r.ok) { legalBankJson.querySelector('textarea').value = ''; await refreshLegalBank(); }
  });
  const legalBankView = el('section', { class: 'admin-view card', 'data-admin-view': 'legal-bank', hidden: 'hidden' }, [
    el('h2', { text: 'بانک قوانین و مقررات' }),
    el('p', { class: 'muted', text: 'ورود متن کامل قوانین، ثبت منبع و مدیریت وضعیت اعتبار. فقط قوانین و موادی که تأیید شده‌اند در پاسخ‌های دستیار بازیابی می‌شوند.' }),
    legalBankNotice, legalBankForm,
    el('h3', { text: 'اسناد ثبت‌شده' }), legalBankList,
  ]);
  // مدیریت رسانه از جدول مستقل انجام می‌شود تا ساختار دوره‌ها/پرونده‌ها دست‌نخورده بماند.
  const mediaSection = el('section', { class: 'admin-media-section' }, [
    el('h2', { text: 'مدیریت رسانه و اندیشه' }),
    el('p', { class: 'muted', text: 'مقاله‌ها و قسمت‌های پادکست ابتدا به‌صورت پیش‌نویس ثبت می‌شوند. انتشار فقط پس از بازبینی علمی انجام شود.' }),
  ]);
  const mediaNotice = el('p', { class: 'form-status', role: 'status' });
  const mediaForm = el('form', { class: 'admin-form card' });
  const mediaKind = el('select', { name: 'kind', required: 'true', 'aria-label': 'نوع رسانه' }, [
    el('option', { value: 'article', text: 'مقاله' }), el('option', { value: 'episode', text: 'قسمت پادکست' }),
  ]);
  const mediaStatus = el('select', { name: 'status', required: 'true', 'aria-label': 'وضعیت انتشار رسانه' }, [
    el('option', { value: 'draft', text: 'پیش‌نویس' }), el('option', { value: 'published', text: 'منتشرشده' }),
  ]);
  const mSlug = field('شناسهٔ انگلیسی', 'mediaSlug');
  const mTitle = field('عنوان رسانه', 'mediaTitle');
  const mSummary = field('خلاصه (۱۰ تا ۶۰۰ نویسه)', 'mediaSummary', '', 'textarea');
  const mAuthor = field('نویسنده (مقاله)', 'mediaAuthor', 'تحریریهٔ آکادمی وکالت شهرام مختاری');
  const mBody = field('متن مقاله؛ هر بند یک خط و حداقل ۲۰ نویسه', 'mediaBody', '', 'textarea');
  const mDate = field('تاریخ انتشار YYYY-MM-DD', 'mediaDate', new Date().toISOString().slice(0, 10));
  const mDescription = field('توضیحات قسمت پادکست', 'mediaDescription', '', 'textarea');
  const mDuration = field('مدت به دقیقه (اختیاری)', 'mediaDuration', '', 'number', false);
  const mAudio = field('نشانی HTTPS فایل صوتی (اختیاری)', 'mediaAudio', '', 'url', false);
  const mediaSubmit = el('button', { class: 'btn', type: 'submit', text: 'ثبت رسانه' });
  mediaForm.append(
    el('label', { class: 'admin-field' }, [el('span', { text: 'نوع رسانه' }), mediaKind]), mSlug, mTitle, mSummary,
    el('label', { class: 'admin-field' }, [el('span', { text: 'وضعیت' }), mediaStatus]), mAuthor, mBody, mDate, mDescription, mDuration, mAudio, mediaSubmit
  );
  const mediaList = el('div', { class: 'admin-content-list' });
  mediaSection.append(mediaNotice, mediaForm, el('h3', { text: 'رسانه‌های ثبت‌شده' }), mediaList);
  mediaView.append(mediaSection);
  function showMediaFields() {
    const article = mediaKind.value === 'article';
    for (const node of [mAuthor, mBody]) node.hidden = !article;
    for (const node of [mDescription, mDuration, mAudio]) node.hidden = article;
    mAuthor.querySelector('input').required = article;
    mBody.querySelector('textarea').required = article;
    mDescription.querySelector('textarea').required = !article;
  }
  async function refreshMedia() {
    const result = await getJson('/api/admin/media');
    if (!result.ok) { mediaNotice.className = 'form-status err'; mediaNotice.textContent = errorText(result.data, result.status); mediaForm.hidden = true; mediaList.replaceChildren(); return; }
    mediaForm.hidden = false; mediaNotice.className = 'form-status'; mediaNotice.textContent = `${result.data.items.length} رسانه دریافت شد.`; mediaList.replaceChildren();
    if (!result.data.items.length) mediaList.append(el('p', { class: 'muted', text: 'رسانهٔ مدیریتی ثبت نشده است.' }));
    for (const item of result.data.items) {
      const row = el('article', { class: 'admin-content-row card' }, [el('div', {}, [el('span', { class: 'badge', text: `${item.kind === 'article' ? 'مقاله' : 'پادکست'} · ${item.status === 'published' ? 'منتشرشده' : 'پیش‌نویس'}` }), el('h3', { text: item.title }), el('p', { class: 'muted', text: `${item.slug} — ${item.summary}` })])]);
      const actions = el('div', { class: 'row admin-actions' });
      const toggle = el('button', { class: 'btn secondary', type: 'button', text: item.status === 'published' ? 'خروج از انتشار' : 'انتشار' });
      toggle.addEventListener('click', async () => {
        const res = await sendJson('PATCH', `/api/admin/media/${item.id}`, { status: item.status === 'published' ? 'draft' : 'published' });
        mediaNotice.className = `form-status${res.ok ? '' : ' err'}`; mediaNotice.textContent = res.ok ? 'وضعیت رسانه تغییر کرد.' : errorText(res.data, res.status); if (res.ok) await refreshMedia();
      });
      actions.append(toggle);
      if (item.status === 'draft') {
        const remove = el('button', { class: 'btn danger', type: 'button', text: 'حذف پیش‌نویس' });
        remove.addEventListener('click', async () => { if (!window.confirm('این پیش‌نویس رسانه حذف شود؟')) return; const res = await sendJson('DELETE', `/api/admin/media/${item.id}`); mediaNotice.className = `form-status${res.ok ? '' : ' err'}`; mediaNotice.textContent = res.ok ? 'پیش‌نویس حذف شد.' : errorText(res.data, res.status); if (res.ok) await refreshMedia(); });
        actions.append(remove);
      }
      row.append(actions); mediaList.append(row);
    }
  }
  mediaKind.addEventListener('change', showMediaFields);
  mediaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const article = mediaKind.value === 'article';
    const payload = article
      ? { author: mAuthor.querySelector('input').value.trim(), body: parseLines(mBody.querySelector('textarea').value), publishedAt: mDate.querySelector('input').value }
      : { description: mDescription.querySelector('textarea').value.trim(), publishedAt: mDate.querySelector('input').value, durationMinutes: mDuration.querySelector('input').value ? Number(mDuration.querySelector('input').value) : null, audioUrl: mAudio.querySelector('input').value.trim() || null };
    const body = { kind: mediaKind.value, slug: mSlug.querySelector('input').value.trim(), title: mTitle.querySelector('input').value.trim(), summary: mSummary.querySelector('textarea').value.trim(), status: mediaStatus.value, payload };
    const result = await postJson('/api/admin/media', body);
    mediaNotice.className = `form-status${result.ok ? '' : ' err'}`; mediaNotice.textContent = result.ok ? 'رسانه ثبت شد.' : errorText(result.data, result.status);
    if (result.ok) { mediaForm.reset(); mediaStatus.value = 'draft'; mAuthor.querySelector('input').value = 'تحریریهٔ آکادمی وکالت شهرام مختاری'; mDate.querySelector('input').value = new Date().toISOString().slice(0, 10); await refreshMedia(); }
  });
  showMediaFields();
  await refreshMedia();
  showKindFields();
  await refresh();
  await refreshImportStatus();

  const dashboardCards = el('div', { class: 'admin-dashboard-grid' });
  const dashboardIntro = el('p', { class: 'muted', text: 'برای ورود به هر ابزار، بخش مربوط را از منوی کناری انتخاب کنید.' });
  dashboardView.append(el('h2', { text: 'نمای کلی مدیریت' }), dashboardIntro, dashboardCards);

  function updateDashboard() {
    const published = currentItems.filter((item) => item.status === 'published').length;
    const drafts = currentItems.length - published;
    const mediaCount = mediaList.querySelectorAll('.admin-content-row').length;
    const caseSummary = importStatus.textContent || 'برای مشاهدهٔ آمار بانک، بخش بانک پرونده و دوره‌ها را باز کنید.';
    dashboardCards.replaceChildren(
      el('article', { class: 'admin-stat-card card' }, [el('span', { class: 'muted', text: 'محتواهای آموزشی' }), el('strong', { text: String(currentItems.length) }), el('small', { text: `${published} منتشرشده · ${drafts} پیش‌نویس` })]),
      el('article', { class: 'admin-stat-card card' }, [el('span', { class: 'muted', text: 'رسانه‌ها' }), el('strong', { text: String(mediaCount) }), el('small', { text: 'مقاله‌ها و قسمت‌های پادکست' })]),
      el('article', { class: 'admin-stat-card card admin-stat-wide' }, [el('span', { class: 'muted', text: 'وضعیت بانک تمرین' }), el('small', { text: caseSummary })]),
      el('article', { class: 'admin-stat-card card' }, [el('span', { class: 'muted', text: 'سرویس‌های سامانه' }), el('strong', { text: 'آمادهٔ بررسی' }), el('small', { text: 'آزمون ایمیل و هوش مصنوعی از بخش سلامت سرویس‌ها' })]),
    );
  }
  updateDashboard();

  const nav = el('nav', { class: 'admin-sidebar', 'aria-label': 'منوی مدیریت', id: 'admin-sidebar' });
  const menuItems = [
    ['dashboard', 'نمای کلی', '▦'],
    ['content', 'دوره‌ها و پرونده‌ها', '▤'],
    ['imports', 'بانک پرونده و بارگذاری', '⇧'],
    ['legal-bank', 'بانک قوانین', '§'],
    ['media', 'رسانه و اندیشه', '▧'],
    ['services', 'سلامت سرویس‌ها', '⚙'],
  ];
  const menuToggle = el('button', { class: 'admin-menu-toggle btn secondary', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'admin-sidebar' }, [el('span', { text: '☰' }), el('span', { text: ' منوی مدیریت' })]);
  const views = { dashboard: dashboardView, content: contentView, imports: importView, 'legal-bank': legalBankView, media: mediaView, services: servicesView };
  function selectView(key) {
    if (key === 'dashboard') updateDashboard();
    if (key === 'legal-bank') refreshLegalBank();
    for (const [name, view] of Object.entries(views)) view.hidden = name !== key;
    for (const button of nav.querySelectorAll('[data-admin-target]')) {
      const active = button.dataset.adminTarget === key;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
  for (const [key, label, symbol] of menuItems) {
    const button = el('button', { class: 'admin-nav-item', type: 'button', 'data-admin-target': key }, [
      el('span', { class: 'admin-nav-icon', 'aria-hidden': 'true', text: symbol }),
      el('span', { text: label }),
    ]);
    button.addEventListener('click', () => selectView(key));
    nav.append(button);
  }
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  const workspace = el('div', { class: 'admin-workspace' }, [nav, el('div', { class: 'admin-main-column' }, [menuToggle, dashboardView, contentView, importView, legalBankView, mediaView, servicesView])]);
  wrap.append(workspace);
  return wrap;
}
