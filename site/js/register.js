// فرم ثبت‌نام: مرحلهٔ حساب کاربری ← بررسی و تأیید.
// ثبت‌نام فعلاً شماره تلفن و پروفایل را نمی‌گیرد و کنترل شماره تکراری ندارد (تصمیم مالک).
// DOM امن (بدون innerHTML با داده). اعتبارسنجی سمت کاربر؛ سرور همچنان مرجع نهایی است.
import { postJson } from './api.js';
import { messageFor } from './auth-messages.js';

const STEP_TITLES = ['حساب کاربری', 'بررسی و تأیید'];
const STEP_KEYS = [['displayName', 'gender', 'position', 'professionalTitle', 'phone', 'email', 'password', 'passwordConfirm']];
/** نام فارسی هر فیلد برای پیام خطای سرور. */
const FIELD_LABELS = {
  displayName: 'نام و نام خانوادگی', gender: 'جنسیت', professionalTitle: 'عنوان', position: 'سمت', phone: 'شماره تلفن همراه', email: 'ایمیل', password: 'رمز عبور', passwordConfirm: 'تکرار رمز عبور',
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

export function registerForm({ onSuccess } = {}) {
  let current = 0;

  // ---------- کنترل‌ها ----------
  const C = {
    displayName: h('input', { type: 'text', name: 'displayName', autocomplete: 'name', maxlength: '100' }),
    gender: h('select', { name: 'gender', required: 'required' }, [h('option', { value: '', text: 'انتخاب کنید' }), h('option', { value: 'male', text: 'آقا' }), h('option', { value: 'female', text: 'خانم' })]),
    position: h('select', { name: 'position', required: 'required' }, [h('option', { value: '', text: 'انتخاب سمت' }), ...[['lawyer','وکیل دادگستری'],['trainee','کارآموز وکالت'],['law_student','دانشجوی حقوق'],['law_graduate','فارغ‌التحصیل حقوق'],['professor','استاد دانشگاه'],['researcher','پژوهشگر حقوق'],['other','سایر']].map(([value,label]) => h('option',{value,text:label}))]),
    professionalTitle: h('select', { name: 'professionalTitle', required: 'required' }, [h('option', { value: '', text: 'انتخاب عنوان' }), ...[['academy_member','عضو آکادمی'],['academy_instructor','مدرس آکادمی'],['academy_researcher','پژوهشگر آکادمی'],['guest_member','عضو مهمان'],['other','سایر']].map(([value,label]) => h('option',{value,text:label}))]),
    phone: h('input', { type: 'tel', name: 'phone', inputmode: 'numeric', autocomplete: 'tel-national', dir: 'ltr', maxlength: '11', placeholder: '09123456789' }),
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
      field('reg-gender', 'جنسیت', C.gender, { required: true }), E.gender,
      field('reg-position', 'سمت', C.position, { required: true, hint: 'برای نمونه: وکیل دادگستری یا کارآموز وکالت.' }), E.position,
      field('reg-professionaltitle', 'عنوان', C.professionalTitle, { required: true, hint: 'برای نمونه: عضو آکادمی.' }), E.professionalTitle,
      field('reg-phone', 'شماره تلفن همراه', C.phone, { required: true, hint: 'شماره همراه را به صورت ۱۱ رقم و با ۰۹ وارد کنید.' }), E.phone,
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
  // ایمیل نرسید؟ پاسخ سرور همیشه عمومی است؛ فاصلهٔ مجاز بین دو ارسال یک دقیقه است.
  let lastEmail = '';
  const resendBtn = h('button', { class: 'btn secondary', type: 'button', hidden: true, text: 'ایمیل نرسید؟ ارسال مجدد لینک تأیید' });
  resendBtn.addEventListener('click', async () => {
    if (!lastEmail) return;
    resendBtn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'در حال ارسال…';
    const r = await postJson('/api/auth/resend-verification', { email: lastEmail });
    status.className = `form-status${r.ok ? ' ok' : ' err'}`;
    status.textContent = r.ok ? (r.data?.message || 'ایمیل تأیید دوباره ارسال شد.') : messageFor(r.networkError ? 'NETWORK' : r.data?.error);
    setTimeout(() => { resendBtn.disabled = false; }, 60 * 1000);
  });

  const form = h('form', { class: 'form reg-form', novalidate: '', 'aria-label': 'فرم ثبت‌نام' }, [
    progress, bar, heading, ...panels,
    h('div', { class: 'reg-actions' }, [backBtn, nextBtn, submitBtn]),
    status,
    h('div', { class: 'row' }, [resendBtn]),
    h('p', {}, [h('a', { href: '#/account', text: 'قبلاً حساب دارید؟ وارد شوید' })]),
  ]);

  // ---------- منطق ----------
  const val = () => ({
    displayName: C.displayName.value.trim(),
    gender: C.gender.value,
    professionalTitle: C.professionalTitle.value,
    position: C.position.value,
    phone: C.phone.value.trim(),
    email: C.email.value.trim(),
    password: C.password.value,
    passwordConfirm: C.passwordConfirm.value,
  });

  function validateStep(index) {
    const v = val();
    const e = {};
    if (index === 0) {
      if (v.displayName.length < 2 || v.displayName.length > 100) e.displayName = 'نام و نام خانوادگی باید بین ۲ و ۱۰۰ نویسه باشد.';
      if (!['male','female'].includes(v.gender)) e.gender = 'لطفاً جنسیت را انتخاب کنید.';
      if (!['lawyer','trainee','law_student','law_graduate','professor','researcher','other'].includes(v.position)) e.position = 'لطفاً سمت را از فهرست انتخاب کنید.';
      if (!['academy_member','academy_instructor','academy_researcher','guest_member','other'].includes(v.professionalTitle)) e.professionalTitle = 'لطفاً عنوان را از فهرست انتخاب کنید.';
      if (!/^09\d{9}$/.test(v.phone)) e.phone = 'شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود.';
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
      ['جنسیت', v.gender === 'male' ? 'آقا' : 'خانم'],
      ['سمت', C.position.selectedOptions[0]?.textContent || v.position],
      ['عنوان', C.professionalTitle.selectedOptions[0]?.textContent || v.professionalTitle],
      ['شماره تلفن همراه', v.phone],
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
    const payload = { displayName: v.displayName, gender: v.gender, professionalTitle: v.professionalTitle, position: v.position, phone: v.phone, email: v.email, password: v.password };
    submitBtn.disabled = true;
    backBtn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'در حال ثبت…';
    const res = await postJson('/api/auth/register', payload);
    submitBtn.disabled = false;
    backBtn.disabled = false;

    if (res.ok) {
      lastEmail = v.email;
      const successPage = h('section', { class: 'registration-success', 'aria-labelledby': 'registration-success-title' }, [
        h('div', { class: 'registration-success-mark', 'aria-hidden': 'true', text: '✓' }),
        h('span', { class: 'registration-success-kicker', text: 'آکادمی وکالت شهرام مختاری' }),
        h('h1', { id: 'registration-success-title', text: 'ثبت‌نام شما با موفقیت انجام شد' }),
        h('p', { class: 'registration-success-lead', text: 'حساب کاربری شما ایجاد شد. ابتدا ایمیل خود را تأیید کنید؛ سپس درخواست عضویت شما توسط مدیریت آکادمی بررسی و نتیجه اعلام می‌شود.' }),
        h('div', { class: 'registration-success-note' }, [
          h('strong', { text: 'مرحلهٔ بعد: تأیید نشانی ایمیل' }),
          h('p', { text: 'صندوق ورودی ایمیل خود را بررسی کنید. اگر پیام را پیدا نکردید، پوشه‌های هرزنامه (Spam) و تبلیغات (Promotions) را هم ببینید.' }),
        ]),
        h('p', { class: 'registration-success-email', dir: 'ltr', text: v.email }),
        h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' }),
        h('button', { class: 'btn secondary registration-resend', type: 'button', text: 'ایمیل تأیید را دریافت نکرده‌ام؛ ارسال مجدد' }),
        h('a', { class: 'btn registration-login-link', href: '#/account', text: 'رفتن به صفحهٔ ورود' }),
      ]);
      const successStatus = successPage.querySelector('.form-status');
      const successResend = successPage.querySelector('.registration-resend');
      successResend.addEventListener('click', async () => {
        successResend.disabled = true;
        successStatus.className = 'form-status';
        successStatus.textContent = 'در حال ارسال مجدد ایمیل تأیید…';
        const resend = await postJson('/api/auth/resend-verification', { email: lastEmail });
        successStatus.className = `form-status${resend.ok ? ' ok' : ' err'}`;
        successStatus.textContent = resend.ok
          ? (resend.data?.message || 'درخواست ارسال ایمیل تأیید ثبت شد؛ صندوق ورودی و Spam را بررسی کنید.')
          : messageFor(resend.networkError ? 'NETWORK' : resend.data?.error);
        window.setTimeout(() => { successResend.disabled = false; }, 60 * 1000);
      });
      form.replaceWith(successPage);
      successPage.querySelector('.registration-login-link')?.focus();
      onSuccess?.(v.email);
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
