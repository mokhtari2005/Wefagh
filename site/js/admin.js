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
  if (data?.error === 'DUPLICATE_SLUG') return 'این شناسه قبلاً برای همین نوع محتوا استفاده شده است.';
  if (data?.error === 'UNPUBLISH_BEFORE_DELETE') return 'ابتدا محتوا را از انتشار خارج کنید و سپس آن را حذف کنید.';
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  return 'عملیات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
}

export async function adminPage() {
  const wrap = el('div', {}, [
    el('span', { class: 'section-kicker', text: 'ویژهٔ مدیران مجاز' }),
    el('h1', { text: 'مدیریت محتوای آکادمی' }),
    el('p', { class: 'lead', text: 'ایجاد و مدیریت پیش‌نویس دوره‌ها و پرونده‌های آموزشی. انتشار محتوا باید پس از بازبینی علمی و حقوقی انجام شود.' }),
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
  const importCases = el('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری بانک پرونده‌ها (پیش‌نویس)' });
  importCases.addEventListener('click', async () => {
    if (!window.confirm('پرونده‌های بانک به‌صورت پیش‌نویس ثبت می‌شوند. پرونده‌های موجود بازنویسی نمی‌شوند. ادامه می‌دهید؟')) return;
    const r = await postJson('/api/admin/cases/import', {});
    importNotice.className = `form-status${r.ok ? '' : ' err'}`;
    importNotice.textContent = r.ok ? `پرونده‌ها: ${r.data.inserted} افزوده، ${r.data.skippedExisting} موجود (بدون بازنویسی).` : errorText(r.data, r.status);
    if (r.ok) { await refresh(); await refreshImportStatus(); }
  });
  const importPanel = el('section', { class: 'admin-import card' }, [
    el('h2', { text: 'بارگذاری محتوای داخلی' }),
    el('p', { class: 'muted', text: 'این بارگذاری‌ها همیشه پیش‌نویس‌اند. پیش از انتشار، هر پرونده باید بررسی حقوقی شود و همهٔ استنادهای آن تأیید یا اصلاح گردد.' }),
    el('div', { class: 'row' }, [importCourses, importCases]),
    importStatus,
    importNotice,
  ]);
  // جست‌وجو در فهرست محتوا (عنوان، شناسه، وضعیت)
  const search = el('input', { type: 'search', placeholder: 'جست‌وجو در عنوان، شناسه یا وضعیت', 'aria-label': 'جست‌وجو در محتوا' });
  search.addEventListener('input', () => {
    const q = search.value.trim();
    for (const row of list.children) row.hidden = Boolean(q) && !(row.dataset.search || '').includes(q);
  });
  wrap.append(notice, form, importPanel, el('h2', { text: 'محتواهای ثبت‌شده' }), search, list);

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
  const mAuthor = field('نویسنده (مقاله)', 'mediaAuthor', 'تحریریهٔ وِفاق');
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
  wrap.append(mediaSection);
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
    if (result.ok) { mediaForm.reset(); mediaStatus.value = 'draft'; mAuthor.querySelector('input').value = 'تحریریهٔ وِفاق'; mDate.querySelector('input').value = new Date().toISOString().slice(0, 10); await refreshMedia(); }
  });
  showMediaFields();
  await refreshMedia();
  showKindFields();
  await refresh();
  await refreshImportStatus();
  return wrap;
}
