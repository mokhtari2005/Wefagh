// تقویم مواعد شخصی: صفحه کامل با انتخاب روز، ثبت، ویرایش و حذف، و کارت «مواعد نزدیک» برای صفحهٔ اول. DOM امن؛ داده‌ها فقط متن‌اند.
import { getJson, postJson, sendJson } from './api.js';
import { messageFor } from './auth-messages.js';
import { deadline as computeDeadline, strictNumber } from './calc/core.js';
import { formatShamsi } from './shamsi.js';
import { parseShamsiInput, isoToShamsiInput } from './jalali.js';
import { shamsiField } from './shamsi-field.js';
import { h } from './dom.js';
import { shamsiCalendar } from './calendar.js';
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
    h('p', { text: 'ثبت و مشاهدهٔ مواعد شخصی پس از ورود به حساب فعال می‌شود.' }),
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
      const when = it.dueTime ? `${shamsi(it.dueDate)} ساعت ${it.dueTime}` : shamsi(it.dueDate);
      ul.append(h('li', {}, [h('strong', { text: when }), document.createTextNode(` — ${it.title}`)]));
    }
    box.append(ul);
  }
  box.append(h('p', {}, [h('a', { href: '#/deadlines', text: 'همهٔ مواعد' })]));
  return box;
}

/** صفحهٔ کامل تقویم */
export async function deadlinesPage(params = {}) {
  const wrap = h('div', { class: 'deadlines-page' }, [
    h('h1', { text: 'تقویم مواعد دادرسی' }),
    h('p', { class: 'lead', text: 'روز مورد نظر را در تقویم انتخاب کنید تا برای ثبت موعد پر شود. مواعد پرونده‌های خود را ثبت و یادآوری ببینید.' }),
  ]);

  const formArea = h('div', { class: 'deadline-edit-area' });
  let loggedIn = false;
  let form = null;
  let refresh = async () => {};

  const cal = shamsiCalendar({
    onSelect: (iso) => {
      if (!form) return;
      form.setDueIso(iso);
      form.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    onMonthChange: async (from, to) => {
      if (!loggedIn) return;
      const res = await getJson(`/api/deadlines?from=${from}&to=${to}`);
      if (!res.ok) return;
      const counts = new Map();
      for (const it of res.data.deadlines) counts.set(it.dueDate, (counts.get(it.dueDate) || 0) + 1);
      cal.setMarks(counts);
    },
  });
  wrap.append(cal);

  const me = await getJson('/api/me');
  if (!me.ok) {
    wrap.append(loginNote());
    return wrap;
  }
  loggedIn = true;

  function showAddForm() {
    form = addForm(() => { showAddForm(); refresh(); }, null);
    formArea.replaceChildren(form);
  }
  function showEditForm(item) {
    const editing = addForm(() => { showAddForm(); refresh(); }, item, () => showAddForm());
    formArea.replaceChildren(editing);
    form = editing;
    editing.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  showAddForm();
  // روز انتخاب‌شده در صفحهٔ اصلی: ?date=YYYY-MM-DD
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && form) form.setDueIso(params.date);
  wrap.append(formArea);

  const listArea = h('div', { role: 'region', 'aria-live': 'polite' });
  wrap.append(listArea);

  refresh = async () => {
    const res = await getJson('/api/deadlines');
    listArea.replaceChildren();
    if (!res.ok) {
      listArea.append(h('p', { class: 'form-status err', role: 'alert', text: messageFor(res.networkError ? 'NETWORK' : res.data?.error) }));
      return;
    }
    listArea.append(renderList(res.data.deadlines, refresh, showEditForm));
    const counts = new Map();
    for (const it of res.data.deadlines) counts.set(it.dueDate, (counts.get(it.dueDate) || 0) + 1);
    cal.setMarks(counts);
  };
  await refresh();
  return wrap;
}

function field(id, label, input) {
  input.id = id;
  return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input]);
}

/**
 * فرم افزودن یا ویرایش مهلت. existing: مورد ویرایشی (یا null). onCancel فقط در حالت ویرایش.
 * form.setDueIso(iso) تاریخ شمسی را از روی تقویم پر می‌کند.
 */
function addForm(onSaved, existing = null, onCancel = null) {
  const title = h('input', { type: 'text', maxlength: '150', required: '' });
  const caseNo = h('input', { type: 'text', maxlength: '60' });
  const kind = h('select', {}, Object.entries(KIND_LABELS).map(([v, t]) => h('option', { value: v, text: t })));
  const due = shamsiField('dl-due', 'تاریخ مهلت یا جلسه (شمسی)', { required: true });
  const time = h('input', { type: 'time', step: '60' });
  const note = h('textarea', { rows: '3', maxlength: '1000' });
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });

  if (existing) {
    title.value = existing.title;
    caseNo.value = existing.caseNo || '';
    kind.value = existing.kind;
    due.input.value = isoToShamsiInput(existing.dueDate);
    time.value = existing.dueTime || '';
    note.value = existing.note || '';
  }

  // محاسبه از تاریخ ابلاغ (شمسی)
  const notice = shamsiField('dl-notice', 'تاریخ ابلاغ (شمسی)');
  const days = h('input', { type: 'number', min: '0', max: '3650', step: '1', inputmode: 'numeric' });
  const calcOut = h('p', { class: 'muted', role: 'status' });
  const calcBtn = h('button', { class: 'btn small', type: 'button', text: 'محاسبه و پرکردن تاریخ' });
  calcBtn.addEventListener('click', () => {
    const noticeIso = parseShamsiInput(notice.input.value);
    if (!noticeIso) {
      calcOut.textContent = 'تاریخ ابلاغ را به شکل ۱۴۰۵/۰۸/۰۶ وارد کنید.';
      return;
    }
    const r = computeDeadline({ noticeDate: noticeIso, days: strictNumber(days.value) });
    if (!r.ok) {
      calcOut.textContent = 'مدت مهلت را درست وارد کنید.';
      return;
    }
    due.input.value = isoToShamsiInput(r.lastDay);
    calcOut.textContent = `آخرین روز پیشنهادی: ${shamsi(r.lastDay)}. ${r.limitations[0]} قاعدهٔ شروع مهلت را وکیل تأیید کند.`;
  });

  const submit = h('button', { class: 'btn', type: 'submit', text: existing ? 'ذخیرهٔ تغییرات' : 'ثبت مهلت' });
  const children = [
    h('h2', { text: existing ? 'ویرایش مهلت' : 'افزودن مهلت' }),
    field('dl-title', 'عنوان (مثلاً: جلسه دادگاه، مهلت اعتراض)', title),
    field('dl-case', 'شمارهٔ پرونده (اختیاری)', caseNo),
    field('dl-kind', 'نوع', kind),
    due.node,
    field('dl-time', 'ساعت (اختیاری)', time),
    h('fieldset', { class: 'checklist' }, [
      h('legend', { text: 'محاسبه از تاریخ ابلاغ (اختیاری)' }),
      notice.node,
      field('dl-days', 'مدت مهلت (روز)', days),
      calcBtn,
      calcOut,
    ]),
    field('dl-note', 'یادداشت (اختیاری)', note),
    h('div', { class: 'row' }, existing ? [submit, h('button', { class: 'btn secondary', type: 'button', text: 'انصراف' })] : [submit]),
    status,
  ];
  const form = h('form', { class: 'form', novalidate: '', 'aria-label': existing ? 'ویرایش مهلت' : 'افزودن مهلت' }, children);
  if (existing) {
    const cancel = form.querySelector('.row .secondary');
    cancel.addEventListener('click', () => onCancel && onCancel());
  }
  form.setDueIso = (iso) => {
    due.input.value = isoToShamsiInput(iso);
    status.className = 'form-status';
    status.textContent = `تاریخ ${shamsi(iso)} برای این موعد انتخاب شد.`;
  };

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
    status.textContent = 'در حال ذخیره…';
    const body = {
      title: title.value,
      caseNo: caseNo.value,
      kind: kind.value,
      dueDate: dueIso,
      dueTime: time.value,
      note: note.value,
    };
    const r = existing
      ? await sendJson('PUT', `/api/deadlines/${existing.id}`, body)
      : await postJson('/api/deadlines', body);
    submit.disabled = false;
    if (r.ok) {
      status.classList.add('ok');
      status.textContent = existing ? 'تغییرات ذخیره شد.' : 'مهلت ثبت شد.';
      if (!existing) {
        form.reset();
        calcOut.textContent = '';
      }
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

function renderList(items, onChanged, onEdit) {
  if (!items.length) return h('p', { class: 'muted', text: 'هنوز مهلتی ثبت نشده است.' });

  const today = todayIso();
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
    list.append(deadlineRow(it, statusOf(it, today), onChanged, onEdit));
  }
  return wrap;
}

function deadlineRow(it, st, onChanged, onEdit) {
  const toggle = h('button', { class: 'btn small', type: 'button', text: it.done ? 'برگرداندن' : 'انجام شد' });
  const edit = h('button', { class: 'btn small secondary', type: 'button', text: 'ویرایش' });
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

  edit.addEventListener('click', () => onEdit(it));

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
  const when = it.dueTime ? `${shamsi(it.dueDate)} ساعت ${it.dueTime}` : shamsi(it.dueDate);
  return h('li', { class: `deadline ${st}` }, [
    h('div', { class: 'deadline-head' }, [
      h('strong', { text: when }),
      h('span', { class: 'badge', text: STATUS_LABELS[st] }),
    ]),
    h('p', { text: it.title }),
    h('p', { class: 'muted', text: meta }),
    it.note ? h('p', { class: 'muted', text: it.note }) : h('span'),
    h('div', { class: 'row' }, [toggle, edit, del]),
    err,
  ]);
}
