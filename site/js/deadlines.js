// تقویم مواعد شخصی: صفحه کامل، و کارت «مواعد نزدیک» برای صفحهٔ اول. DOM امن؛ داده‌ها فقط متن‌اند.
import { getJson, postJson, sendJson } from './api.js';
import { messageFor } from './auth-messages.js';
import { deadline as computeDeadline } from './calc/core.js';
import { formatShamsi } from './shamsi.js';
import { parseShamsiInput, isoToShamsiInput } from './jalali.js';
import { shamsiField } from './shamsi-field.js';
import { h } from './dom.js';
import { todayIso, statusOf, sortDeadlines, upcomingOpen, KIND_LABELS, STATUS_LABELS } from './deadlines-core.js';

function shamsi(iso) {
  return formatShamsi(new Date(`${iso}T12:00:00Z`));
}

function monthTitle(iso) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', timeZone: 'Asia/Tehran' }).format(
    new Date(`${iso}T12:00:00Z`)
  );
}

function loginNote() {
  return h('div', { class: 'notice', role: 'note' }, [
    h('p', { text: 'تقویم مواعد شخصی است و فقط پس از ورود به حساب نمایش داده می‌شود.' }),
    h('p', {}, [h('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })]),
  ]);
}

/** کارت صفحهٔ اول: چند مهلت نزدیک یا دعوت به ورود */
export async function upcomingCard() {
  const box = h('section', { class: 'deadline-card' }, [h('h2', { text: 'مواعد نزدیک' })]);
  const res = await getJson(`/api/deadlines?from=${todayIso()}`);
  if (res.status === 401) {
    box.append(h('p', { class: 'muted', text: 'مواعد دادرسی خود را ثبت و یادآوری بگیرید.' }), h('p', {}, [h('a', { href: '#/deadlines', text: 'تقویم مواعد' })]));
    return box;
  }
  if (!res.ok) {
    box.append(h('p', { class: 'form-status err', role: 'alert', text: messageFor(res.networkError ? 'NETWORK' : res.data?.error) }));
    return box;
  }
  const items = upcomingOpen(res.data.deadlines, todayIso());
  if (!items.length) {
    box.append(h('p', { class: 'muted', text: 'مهلت نزدیکی ثبت نشده است.' }));
  } else {
    const ul = h('ul');
    for (const it of items) {
      ul.append(h('li', {}, [h('strong', { text: shamsi(it.dueDate) }), document.createTextNode(` — ${it.title}`)]));
    }
    box.append(ul);
  }
  box.append(h('p', {}, [h('a', { href: '#/deadlines', text: 'همهٔ مواعد' })]));
  return box;
}

/** صفحهٔ کامل تقویم */
export async function deadlinesPage() {
  const wrap = h('div', {}, [
    h('h1', { text: 'تقویم مواعد دادرسی' }),
    h('p', { class: 'lead', text: 'مواعد پرونده‌های خود را ثبت کنید و یادآوری ببینید. این اطلاعات فقط برای شما نمایش داده می‌شود.' }),
  ]);
  const me = await getJson('/api/me');
  if (!me.ok) {
    wrap.append(loginNote());
    return wrap;
  }

  wrap.append(addForm(() => refresh()));
  const listArea = h('div', { role: 'region', 'aria-live': 'polite' });
  wrap.append(listArea);

  async function refresh() {
    const res = await getJson('/api/deadlines');
    listArea.replaceChildren();
    if (!res.ok) {
      listArea.append(h('p', { class: 'form-status err', role: 'alert', text: messageFor(res.networkError ? 'NETWORK' : res.data?.error) }));
      return;
    }
    listArea.append(renderList(res.data.deadlines, refresh));
  }
  await refresh();
  return wrap;
}

function field(id, label, input) {
  input.id = id;
  return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input]);
}

function addForm(onSaved) {
  const title = h('input', { type: 'text', maxlength: '150', required: '' });
  const caseNo = h('input', { type: 'text', maxlength: '60' });
  const kind = h('select', {}, Object.entries(KIND_LABELS).map(([v, t]) => h('option', { value: v, text: t })));
  const due = shamsiField('dl-due', 'تاریخ مهلت یا جلسه (شمسی)', { required: true });
  const note = h('textarea', { rows: '3', maxlength: '1000' });
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });

  // محاسبه از تاریخ ابلاغ (شمسی)
  const notice = shamsiField('dl-notice', 'تاریخ ابلاغ (شمسی)');
  const days = h('input', { type: 'number', min: '0', max: '3650', step: '1', inputmode: 'numeric' });
  const calcOut = h('p', { class: 'muted', role: 'status' });
  const calcBtn = h('button', { class: 'btn', type: 'button', text: 'محاسبه و پرکردن تاریخ' });
  calcBtn.addEventListener('click', () => {
    const noticeIso = parseShamsiInput(notice.input.value);
    if (!noticeIso) {
      calcOut.textContent = 'تاریخ ابلاغ را به شکل ۱۴۰۵/۰۸/۰۶ وارد کنید.';
      return;
    }
    const r = computeDeadline({ noticeDate: noticeIso, days: Number(days.value) });
    if (!r.ok) {
      calcOut.textContent = 'مدت مهلت را درست وارد کنید.';
      return;
    }
    due.input.value = isoToShamsiInput(r.lastDay);
    calcOut.textContent = `آخرین روز پیشنهادی: ${shamsi(r.lastDay)}. ${r.limitations[0]} قاعدهٔ شروع مهلت را وکیل تأیید کند.`;
  });

  const submit = h('button', { class: 'btn', type: 'submit', text: 'ثبت مهلت' });
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'افزودن مهلت' }, [
    h('h2', { text: 'افزودن مهلت' }),
    field('dl-title', 'عنوان (مثلاً: جلسه دادگاه، مهلت اعتراض)', title),
    field('dl-case', 'شمارهٔ پرونده (اختیاری)', caseNo),
    field('dl-kind', 'نوع', kind),
    due.node,
    h('fieldset', { class: 'checklist' }, [
      h('legend', { text: 'محاسبه از تاریخ ابلاغ (اختیاری)' }),
      notice.node,
      field('dl-days', 'مدت مهلت (روز)', days),
      calcBtn,
      calcOut,
    ]),
    field('dl-note', 'یادداشت (اختیاری)', note),
    submit,
    status,
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dueIso = parseShamsiInput(due.input.value);
    if (!dueIso) {
      status.className = 'form-status err';
      status.textContent = 'تاریخ مهلت را به شکل ۱۴۰۵/۰۸/۰۶ (شمسی) وارد کنید.';
      return;
    }
    submit.disabled = true;
    status.className = 'form-status';
    status.textContent = 'در حال ثبت…';
    const r = await postJson('/api/deadlines', {
      title: title.value,
      caseNo: caseNo.value,
      kind: kind.value,
      dueDate: dueIso,
      note: note.value,
    });
    submit.disabled = false;
    if (r.ok) {
      form.reset();
      calcOut.textContent = '';
      status.classList.add('ok');
      status.textContent = 'مهلت ثبت شد.';
      onSaved();
      return;
    }
    status.classList.add('err');
    if (r.status === 422 && r.data?.errors) {
      status.textContent = Object.values(r.data.errors).join(' ');
    } else {
      status.textContent = messageFor(r.networkError ? 'NETWORK' : r.data?.error);
    }
  });
  return form;
}

function renderList(items, onChanged) {
  const today = todayIso();
  if (!items.length) return h('p', { class: 'muted', text: 'هنوز مهلتی ثبت نشده است.' });

  const wrap = h('div');
  let currentMonth = null;
  let list = null;
  for (const it of sortDeadlines(items)) {
    const m = monthTitle(it.dueDate);
    if (m !== currentMonth) {
      currentMonth = m;
      wrap.append(h('h2', { text: m }));
      list = h('ul', { class: 'deadline-list' });
      wrap.append(list);
    }
    list.append(deadlineRow(it, statusOf(it, today), onChanged));
  }
  return wrap;
}

function deadlineRow(it, st, onChanged) {
  const toggle = h('button', { class: 'btn small', type: 'button', text: it.done ? 'برگرداندن' : 'انجام شد' });
  const del = h('button', { class: 'btn small danger', type: 'button', text: 'حذف' });
  const err = h('p', { class: 'form-status err', role: 'alert' });

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    const r = await sendJson('PATCH', `/api/deadlines/${it.id}`, { done: !it.done });
    if (r.ok) onChanged();
    else {
      toggle.disabled = false;
      err.textContent = messageFor(r.networkError ? 'NETWORK' : r.data?.error) || 'ذخیرهٔ تغییر ناموفق بود.';
    }
  });

  del.addEventListener('click', async () => {
    if (!window.confirm('این مهلت حذف شود؟')) return;
    del.disabled = true;
    const r = await sendJson('DELETE', `/api/deadlines/${it.id}`);
    if (r.ok) onChanged();
    else {
      del.disabled = false;
      err.textContent = messageFor(r.networkError ? 'NETWORK' : r.data?.error) || 'حذف ناموفق بود.';
    }
  });

  const meta = [KIND_LABELS[it.kind], it.caseNo ? `پرونده ${it.caseNo}` : null].filter(Boolean).join(' · ');
  return h('li', { class: `deadline ${st}` }, [
    h('div', { class: 'deadline-head' }, [
      h('strong', { text: shamsi(it.dueDate) }),
      h('span', { class: 'badge', text: STATUS_LABELS[st] }),
    ]),
    h('p', { text: it.title }),
    h('p', { class: 'muted', text: meta }),
    it.note ? h('p', { class: 'muted', text: it.note }) : h('span'),
    h('div', { class: 'row' }, [toggle, del]),
    err,
  ]);
}
