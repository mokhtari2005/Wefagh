// فرم ثبت‌نام: مرحلهٔ حساب کاربری ← بررسی و تأیید.
// ثبت‌نام فعلاً شماره تلفن و پروفایل را نمی‌گیرد و کنترل شماره تکراری ندارد (تصمیم مالک).
// DOM امن (بدون innerHTML با داده). اعتبارسنجی سمت کاربر؛ سرور همچنان مرجع نهایی است.
import { postJson } from './api.js';
import { messageFor, REGISTER_SENT } from './auth-messages.js';

const STEP_TITLES = ['حساب کاربری', 'بررسی و تأیید'];
const STEP_KEYS = [['displayName', 'email', 'password', 'passwordConfirm']];
/** نام فارسی هر فیلد برای پیام خطای سرور. */
const FIELD_LABELS = {
  displayName: 'نام', email: 'ایمیل', password: 'رمز عبور', passwordConfirm: 'تکرار رمز عبور',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** عدد را با ارقام فارسی نمایش می‌دهد. */
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'disabled' || k === 'hidden') { if (v) node[k] = true; }
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/** برچسب + کنترل. خطا را فراخواننده کنار فیلد قرار می‌دهد. */
function field(id, labelText, control, { required = false, hint = '' } = {}) {
  control.id = id;
  const label = h('label', { for: id }, [
    document.createTextNode(labelText),
    required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null,
  ]);
  return h('div', { class: 'field' }, [label, hint ? h('p', { class: 'field-hint muted', text: hint }) : null, control]);
}

function errorFor(id) {
  return h('div', { class: 'error', id: `${id}-err`, 'aria-live': 'polite' });
}

export function registerForm() {
  let current = 0;

  // ---------- کنترل‌ها ----------
  const C = {
    displayName: h('input', { type: 'text', name: 'displayName', autocomplete: 'name', maxlength: '100' }),
    email: h('input', { type: 'email', name: 'email', autocomplete: 'email', dir: 'ltr', maxlength: '254' }),
    password: h('input', { type: 'password', name: 'password', autocomplete: 'new-password', maxlength: '128' }),
    passwordConfirm: h('input', { type: 'password', name: 'passwordConfirm', autocomplete: 'new-password', maxlength: '128' }),
  };
  const E = Object.fromEntries(Object.keys(C).map((k) => [k, errorFor(`reg-${k.toLowerCase()}`)]));

  const pwToggle = h('button', { class: 'btn secondary small', type: 'button', 'aria-pressed': 'false', text: 'نمایش رمز' });
  pwToggle.addEventListener('click', () => {
    const show = C.password.type === 'password';
    C.password.type = show ? 'text' : 'password';
    C.passwordConfirm.type = show ? 'text' : 'password';
    pwToggle.setAttribute('aria-pressed', String(show));
    pwToggle.textContent = show ? 'پنهان کردن رمز' : 'نمایش رمز';
  });

  // ---------- بخش‌های مراحل ----------
  const panels = [
    h('section', { class: 'reg-step-body', 'aria-label': STEP_TITLES[0] }, [
      field('reg-displayname', 'نام و نام خانوادگی', C.displayName, { required: true }), E.displayName,
      field('reg-email', 'نشانی ایمیل', C.email, { required: true, hint: 'لینک تأیید حساب به این نشانی ارسال می‌شود.' }), E.email,
      field('reg-password', 'رمز عبور (حداقل ۱۰ نویسه)', C.password, { required: true }), E.password,
      field('reg-passwordconfirm', 'تکرار رمز عبور', C.passwordConfirm, { required: true }), E.passwordConfirm,
      h('div', { class: 'row' }, [pwToggle]),
    ]),
    h('section', { class: 'reg-step-body', 'aria-label': STEP_TITLES[1] }, []),
  ];
  const summary = h('dl', { class: 'review-summary' });
  const confirmBox = h('input', { type: 'checkbox', name: 'confirmAccuracy' });
  const confirmErr = errorFor('reg-confirm');
  panels[1].append(
    h('h3', { text: 'خلاصهٔ اطلاعات' }),
    h('p', { class: 'muted', text: 'رمز عبور در این خلاصه نمایش داده نمی‌شود. پس از ثبت، لینک تأیید به ایمیل شما ارسال می‌شود.' }),
    summary,
    h('label', { class: 'chip confirm' }, [confirmBox, h('span', { text: 'اطلاعات واردشده را بررسی کرده‌ام و درست است.' })]),
    confirmErr,
  );

  // ---------- نوار پیشرفت و دکمه‌ها ----------
  const progressItems = STEP_TITLES.map((title, i) => h('li', { class: 'reg-step' }, [
    h('span', { class: 'reg-step-num', text: fa(i + 1) }),
    h('span', { class: 'reg-step-title', text: title }),
  ]));
  const progress = h('ol', { class: 'reg-progress', 'aria-label': 'مراحل ثبت‌نام' }, progressItems);
  const bar = h('div', { class: 'reg-bar', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(STEP_TITLES.length), 'aria-label': 'پیشرفت ثبت‌نام' }, [h('span')]);
  const heading = h('h2', { class: 'reg-heading', tabindex: '-1' });
  const backBtn = h('button', { class: 'btn secondary', type: 'button', text: 'بازگشت' });
  const nextBtn = h('button', { class: 'btn', type: 'button', text: 'ادامه' });
  const submitBtn = h('button', { class: 'btn', type: 'submit', text: 'ثبت نهایی و ساختن حساب' });
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });

  const form = h('form', { class: 'form reg-form', novalidate: '', 'aria-label': 'فرم ثبت‌نام' }, [
    progress, bar, heading, ...panels,
    h('div', { class: 'reg-actions' }, [backBtn, nextBtn, submitBtn]),
    status,
    h('p', {}, [h('a', { href: '#/account', text: 'قبلاً حساب دارید؟ وارد شوید' })]),
  ]);

  // ---------- منطق ----------
  const val = () => ({
    displayName: C.displayName.value.trim(),
    email: C.email.value.trim(),
    password: C.password.value,
    passwordConfirm: C.passwordConfirm.value,
  });

  function validateStep(index) {
    const v = val();
    const e = {};
    if (index === 0) {
      if (v.displayName.length < 2 || v.displayName.length > 100) e.displayName = 'نام باید بین ۲ و ۱۰۰ نویسه باشد.';
      if (!EMAIL_RE.test(v.email) || v.email.length > 254) e.email = 'نشانی ایمیل معتبر نیست.';
      if (v.password.length < 10 || v.password.length > 128) e.password = 'رمز عبور باید بین ۱۰ و ۱۲۸ نویسه باشد.';
      else if (v.password !== v.passwordConfirm) e.passwordConfirm = 'تکرار رمز با رمز عبور یکی نیست.';
    }
    showErrors(index, e);
    return e;
  }

  /** پیام‌های خطای یک مرحله را نشان می‌دهد و فیلد خطادار را علامت می‌زند. */
  function showErrors(index, errors) {
    for (const key of STEP_KEYS[index] || []) setError(key, errors[key]);
  }

  function setError(key, message) {
    const node = E[key];
    if (!node) return;
    node.textContent = message || '';
    const target = C[key];
    if (target) target.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearErrors() {
    for (const key of Object.keys(E)) setError(key, '');
    confirmErr.textContent = '';
    status.textContent = '';
  }

  function buildSummary() {
    const v = val();
    const rows = [
      ['نام و نام خانوادگی', v.displayName],
      ['ایمیل', v.email],
    ];
    summary.replaceChildren(...rows.map(([k, val2]) => h('div', { class: 'review-row' }, [
      h('dt', { text: k }), h('dd', { text: val2 || '—' }),
    ])));
  }

  function renderStep(index) {
    current = index;
    panels.forEach((p, i) => { p.hidden = i !== index; });
    heading.textContent = `مرحلهٔ ${fa(index + 1)} از ${fa(STEP_TITLES.length)}: ${STEP_TITLES[index]}`;
    progressItems.forEach((li, i) => {
      li.classList.toggle('done', i < index);
      li.classList.toggle('current', i === index);
      if (i === index) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    bar.firstElementChild.style.width = `${((index + 1) / STEP_TITLES.length) * 100}%`;
    bar.setAttribute('aria-valuenow', String(index + 1));
    backBtn.hidden = index === 0;
    nextBtn.hidden = index === STEP_TITLES.length - 1;
    submitBtn.hidden = index !== STEP_TITLES.length - 1;
    if (index === STEP_TITLES.length - 1) buildSummary();
    heading.focus();
  }

  backBtn.addEventListener('click', () => {
    status.textContent = '';
    renderStep(Math.max(0, current - 1));
  });
  nextBtn.addEventListener('click', () => {
    const errors = validateStep(current);
    if (Object.keys(errors).length > 0) {
      status.className = 'form-status err';
      status.textContent = 'لطفاً خطاهای این مرحله را اصلاح کنید.';
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    status.textContent = '';
    renderStep(current + 1);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    for (let i = 0; i < STEP_KEYS.length; i++) {
      if (Object.keys(validateStep(i)).length > 0) {
        renderStep(i);
        status.className = 'form-status err';
        status.textContent = 'لطفاً خطاهای این مرحله را اصلاح کنید.';
        return;
      }
    }
    if (!confirmBox.checked) {
      confirmErr.textContent = 'برای ادامه، تأیید اطلاعات لازم است.';
      status.className = 'form-status err';
      status.textContent = 'لطفاً اطلاعات را تأیید کنید.';
      confirmBox.focus();
      return;
    }
    const v = val();
    const payload = { displayName: v.displayName, email: v.email, password: v.password };
    submitBtn.disabled = true;
    backBtn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'در حال ثبت…';
    const res = await postJson('/api/auth/register', payload);
    submitBtn.disabled = false;
    backBtn.disabled = false;

    if (res.ok) {
      form.reset();
      clearErrors();
      status.className = 'form-status ok';
      status.textContent = REGISTER_SENT;
      renderStep(0);
      return;
    }
    if (res.status === 422 && res.data?.errors) {
      clearErrors();
      const errors = res.data.errors;
      for (const [key, msg] of Object.entries(errors)) setError(key, msg);
      const step = STEP_KEYS.findIndex((keys) => keys.some((k) => errors[k]));
      renderStep(step < 0 ? 0 : step);
      const names = Object.keys(errors).map((k) => FIELD_LABELS[k] || 'یکی از فیلدها').filter((v, i, a) => a.indexOf(v) === i);
      status.className = 'form-status err';
      status.textContent = names.length
        ? `این فیلدها نامعتبرند: ${names.join('، ')}. خطای هر فیلد زیر همان فیلد نشان داده شده است.`
        : messageFor('VALIDATION_FAILED');
      return;
    }
    status.className = 'form-status err';
    status.textContent = messageFor(res.networkError ? 'NETWORK' : res.data?.error);
  });

  renderStep(0);
  return form;
}
