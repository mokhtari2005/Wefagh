// فرم‌های مدیریت حساب: تغییر رمز عبور و ویرایش پروفایل. DOM امن (بدون innerHTML با داده).
import { sendJson, postJson } from './api.js';
import { messageFor } from './auth-messages.js';
import { PROVINCES, PROFESSIONAL_STATUS, LICENSED_STATUSES, EXPERIENCE_BANDS, PRACTICE_AREAS, LEARNING_GOALS, SKILL_AREAS, SKILL_LEVELS, LEARNING_FORMATS, toLatinDigits } from './registration-options.js';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'selected' || k === 'checked' || k === 'disabled') { if (v) node[k] = true; }
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function setStatus(node, text, kind) {
  node.className = `form-status${kind ? ` ${kind}` : ''}`;
  node.textContent = text;
}

function selectOf(id, options, value, placeholder) {
  const select = h('select', { id, name: id });
  select.append(h('option', { value: '', text: placeholder }));
  for (const [key, label] of Object.entries(options)) {
    select.append(h('option', { value: key, text: label, selected: key === value }));
  }
  return select;
}

function checkGroup(name, options, values) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': name });
  for (const [key, label] of Object.entries(options)) {
    const box = h('input', { type: 'checkbox', name, value: key, checked: values.includes(key) });
    wrap.append(h('label', { class: 'chip' }, [box, h('span', { text: label })]));
  }
  return wrap;
}

function fieldWrap(id, label, control, errorNode) {
  return h('div', { class: 'field' }, [h('label', { for: id, text: label }), control, errorNode]);
}

function errorNode(id) {
  return h('div', { class: 'error', id: `${id}-err` });
}

/** خطاهای فیلدی را در محل خودشان نشان می‌دهد و خطاهای ناشناخته را به‌صورت پیام کلی. */
function applyErrors(errors, nodes) {
  for (const [key, node] of Object.entries(nodes)) node.textContent = errors?.[key] || '';
}

// ---------- تغییر رمز عبور ----------
export function changePasswordForm() {
  const current = h('input', { type: 'password', name: 'currentPassword', autocomplete: 'current-password', required: '' });
  const next = h('input', { type: 'password', name: 'newPassword', autocomplete: 'new-password', required: '', minlength: '10' });
  const currentErr = errorNode('cp-current');
  const nextErr = errorNode('cp-new');
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'تغییر رمز عبور' });

  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'تغییر رمز عبور' }, [
    h('h2', { text: 'تغییر رمز عبور' }),
    fieldWrap('cp-current', 'رمز عبور فعلی', current, currentErr),
    fieldWrap('cp-new', 'رمز عبور جدید (حداقل ۱۰ نویسه)', next, nextErr),
    submit,
    status,
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    applyErrors({}, { 'cp-current': currentErr, 'cp-new': nextErr });
    submit.disabled = true;
    setStatus(status, 'در حال ذخیره…');
    const res = await postJson('/api/auth/change-password', { currentPassword: current.value, newPassword: next.value });
    submit.disabled = false;
    current.value = '';
    next.value = '';
    if (res.ok) {
      setStatus(status, 'رمز عبور تغییر کرد. نشست‌های دیگر این حساب خاتمه یافتند.', 'ok');
      return;
    }
    if (res.data?.errors) applyErrors(res.data.errors, { 'cp-current': currentErr, 'cp-new': nextErr });
    setStatus(status, messageFor(res.networkError ? 'NETWORK' : res.data?.error), 'err');
  });

  return form;
}

// ---------- ویرایش پروفایل ----------
export function profileEditForm(profile, onSaved) {
  const p = profile || {};
  const phone = h('input', { id: 'pe-phone', name: 'phone', dir: 'ltr', inputmode: 'numeric', value: toLatinDigits(p.phone || '') });
  const province = selectOf('pe-province', Object.fromEntries(PROVINCES.map((x) => [x, x])), p.province || '', 'استان را انتخاب کنید');
  const city = h('input', { id: 'pe-city', name: 'city', value: p.city || '', maxlength: '60' });
  const professional = selectOf('pe-professional', PROFESSIONAL_STATUS, p.professionalStatus || '', 'انتخاب کنید');
  const bar = h('input', { id: 'pe-bar', name: 'barAssociation', value: p.barAssociation || '', maxlength: '120' });
  const license = h('input', { id: 'pe-license', name: 'licenseNumber', dir: 'ltr', value: p.licenseNumber || '', maxlength: '30' });
  const licenseYear = h('input', { id: 'pe-license-year', name: 'licenseYear', dir: 'ltr', inputmode: 'numeric', value: p.licenseYear || '' });
  const experience = selectOf('pe-experience', EXPERIENCE_BANDS, p.experienceBand || '', 'انتخاب کنید');
  const goal = selectOf('pe-goal', LEARNING_GOALS, p.learningGoal || '', 'انتخاب کنید');
  const level = selectOf('pe-level', SKILL_LEVELS, p.skillLevel || '', 'انتخاب کنید');
  const format = selectOf('pe-format', LEARNING_FORMATS, p.learningFormat || '', 'انتخاب کنید');
  const practice = checkGroup('practiceAreas', PRACTICE_AREAS, p.practiceAreas || []);
  const skills = checkGroup('skillAreas', SKILL_AREAS, p.skillAreas || []);
  const notes = h('textarea', { id: 'pe-notes', name: 'notes', rows: '3', maxlength: '500' });
  notes.value = p.notes || '';

  const errs = {
    phone: errorNode('pe-phone'), province: errorNode('pe-province'), city: errorNode('pe-city'),
    professionalStatus: errorNode('pe-professional'), barAssociation: errorNode('pe-bar'),
    licenseNumber: errorNode('pe-license'), licenseYear: errorNode('pe-license-year'),
    experienceBand: errorNode('pe-experience'), practiceAreas: errorNode('pe-practice'),
    learningGoal: errorNode('pe-goal'), skillAreas: errorNode('pe-skills'), skillLevel: errorNode('pe-level'),
    learningFormat: errorNode('pe-format'), notes: errorNode('pe-notes'),
  };
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'ذخیرهٔ پروفایل' });

  const barBlock = h('div', { class: 'stack' }, [
    fieldWrap('pe-bar', 'نام کانون یا مرجع صادرکنندهٔ پروانه', bar, errs.barAssociation),
    fieldWrap('pe-license', 'شماره پروانه (اختیاری)', license, errs.licenseNumber),
    fieldWrap('pe-license-year', 'سال صدور پروانه (اختیاری)', licenseYear, errs.licenseYear),
  ]);
  function syncLicensed() {
    barBlock.hidden = !LICENSED_STATUSES.includes(professional.value);
  }
  professional.addEventListener('change', syncLicensed);

  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'ویرایش پروفایل' }, [
    h('h2', { text: 'پروفایل آموزشی' }),
    fieldWrap('pe-phone', 'شمارهٔ موبایل', phone, errs.phone),
    fieldWrap('pe-province', 'استان', province, errs.province),
    fieldWrap('pe-city', 'شهر', city, errs.city),
    fieldWrap('pe-professional', 'وضعیت حرفه‌ای', professional, errs.professionalStatus),
    barBlock,
    fieldWrap('pe-experience', 'میزان سابقه', experience, errs.experienceBand),
    h('div', { class: 'field' }, [h('span', { text: 'حوزه‌های فعالیت یا علاقه' }), practice, errs.practiceAreas]),
    fieldWrap('pe-goal', 'هدف اصلی', goal, errs.learningGoal),
    h('div', { class: 'field' }, [h('span', { text: 'مهارت‌های مورد نظر' }), skills, errs.skillAreas]),
    fieldWrap('pe-level', 'سطح فعلی مهارت', level, errs.skillLevel),
    fieldWrap('pe-format', 'روش آموزشی ترجیحی', format, errs.learningFormat),
    fieldWrap('pe-notes', 'یادداشت (اختیاری)', notes, errs.notes),
    submit,
    status,
  ]);
  syncLicensed();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
    const body = {
      phone: phone.value,
      province: province.value,
      city: city.value.trim(),
      professionalStatus: professional.value,
      barAssociation: bar.value.trim(),
      licenseNumber: license.value.trim(),
      licenseYear: licenseYear.value.trim(),
      experienceBand: experience.value,
      practiceAreas: checked('practiceAreas'),
      learningGoal: goal.value,
      skillAreas: checked('skillAreas'),
      skillLevel: level.value,
      learningFormat: format.value,
      notes: notes.value.trim(),
    };
    applyErrors({}, Object.fromEntries(Object.entries(errs)));
    submit.disabled = true;
    setStatus(status, 'در حال ذخیره…');
    const res = await sendJson('PUT', '/api/me/profile', { profile: body });
    submit.disabled = false;
    if (res.ok) {
      setStatus(status, 'پروفایل ذخیره شد.', 'ok');
      if (onSaved) onSaved(res.data?.profile);
      return;
    }
    applyErrors(res.data?.errors, errs);
    setStatus(status, messageFor(res.networkError ? 'NETWORK' : res.data?.error), 'err');
  });

  return form;
}
