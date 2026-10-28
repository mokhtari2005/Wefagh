// فرم چندمرحله‌ای ثبت‌نام: حساب و تماس ← اطلاعات حرفه‌ای ← نیازهای آموزشی ← بررسی و تأیید.
// DOM امن (بدون innerHTML با داده). اعتبارسنجی سمت کاربر؛ سرور همچنان مرجع نهایی است.
import { postJson } from './api.js';
import { messageFor, REGISTER_SENT } from './auth-messages.js';
import {
  PROVINCES, PROFESSIONAL_STATUS, LICENSED_STATUSES, EXPERIENCE_BANDS, PRACTICE_AREAS,
  LEARNING_GOALS, SKILL_AREAS, SKILL_LEVELS, LEARNING_FORMATS, normalizePhone, toLatinDigits,
} from './registration-options.js';

const STEP_TITLES = ['حساب و تماس', 'اطلاعات حرفه‌ای', 'نیازهای آموزشی', 'بررسی و تأیید'];
const STEP_KEYS = [
  ['displayName', 'phone', 'email', 'province', 'city', 'password', 'passwordConfirm'],
  ['professionalStatus', 'barAssociation', 'licenseNumber', 'licenseYear', 'experienceBand', 'practiceAreas'],
  ['learningGoal', 'skillAreas', 'skillLevel', 'learningFormat', 'notes'],
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** عدد را با ارقام فارسی نمایش می‌دهد. */
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden') { if (v) node[k === 'hidden' ? 'hidden' : k] = true; }
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

function chipGroup(name, options) {
  return h('div', { class: 'chip-grid' }, Object.entries(options).map(([value, text]) =>
    h('label', { class: 'chip' }, [h('input', { type: 'checkbox', name, value }), h('span', { text })])));
}

function cardGroup(name, options, label) {
  return h('div', { class: 'choice-cards', role: 'radiogroup', 'aria-label': label }, Object.entries(options).map(([value, text]) =>
    h('label', { class: 'card-choice' }, [h('input', { type: 'radio', name, value }), h('span', { text })])));
}

function selectWith(name, options, placeholder) {
  return h('select', { name }, [
    h('option', { value: '', text: placeholder }),
    ...Object.entries(options).map(([v, t]) => h('option', { value: v, text: t })),
  ]);
}

export function registerForm() {
  let current = 0;

  // ---------- کنترل‌ها ----------
  const C = {
    displayName: h('input', { type: 'text', name: 'displayName', autocomplete: 'name', maxlength: '100' }),
    phone: h('input', { type: 'tel', name: 'phone', inputmode: 'tel', autocomplete: 'tel-national', dir: 'ltr', maxlength: '16', placeholder: '09xxxxxxxxx' }),
    email: h('input', { type: 'email', name: 'email', autocomplete: 'email', dir: 'ltr', maxlength: '254' }),
    province: selectWith('province', Object.fromEntries(PROVINCES.map((p) => [p, p])), 'انتخاب استان'),
    city: h('input', { type: 'text', name: 'city', autocomplete: 'address-level2', maxlength: '60' }),
    password: h('input', { type: 'password', name: 'password', autocomplete: 'new-password', maxlength: '128' }),
    passwordConfirm: h('input', { type: 'password', name: 'passwordConfirm', autocomplete: 'new-password', maxlength: '128' }),
    professionalStatus: null,
    barAssociation: h('input', { type: 'text', name: 'barAssociation', maxlength: '120' }),
    licenseNumber: h('input', { type: 'text', name: 'licenseNumber', maxlength: '30', dir: 'ltr' }),
    licenseYear: h('input', { type: 'text', name: 'licenseYear', inputmode: 'numeric', maxlength: '4', dir: 'ltr', placeholder: 'مثلاً ۱۴۰۲' }),
    experienceBand: selectWith('experienceBand', EXPERIENCE_BANDS, 'انتخاب کنید'),
    practiceAreas: null,
    learningGoal: selectWith('learningGoal', LEARNING_GOALS, 'انتخاب کنید'),
    skillAreas: null,
    skillLevel: null,
    learningFormat: null,
    notes: h('textarea', { name: 'notes', rows: '3', maxlength: '500' }),
  };
  C.professionalStatus = cardGroup('professionalStatus', PROFESSIONAL_STATUS, 'وضعیت حرفه‌ای');
  C.practiceAreas = chipGroup('practiceAreas', PRACTICE_AREAS);
  C.skillAreas = chipGroup('skillAreas', SKILL_AREAS);
  C.skillLevel = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'سطح مهارت' }, Object.entries(SKILL_LEVELS).map(([value, text]) =>
    h('label', { class: 'seg' }, [h('input', { type: 'radio', name: 'skillLevel', value }), h('span', { text })])));
  C.learningFormat = cardGroup('learningFormat', LEARNING_FORMATS, 'روش آموزشی');

  const E = Object.fromEntries(Object.keys(C).map((k) => [k, errorFor(`reg-${k.toLowerCase()}`)]));
  const notesCount = h('p', { class: 'field-hint muted', text: `${fa(0)} / ${fa(500)}` });
  C.notes.addEventListener('input', () => { notesCount.textContent = `${fa(C.notes.value.length)} / ${fa(500)}`; });

  const pwToggle = h('button', { class: 'btn secondary small', type: 'button', 'aria-pressed': 'false', text: 'نمایش رمز' });
  pwToggle.addEventListener('click', () => {
    const show = C.password.type === 'password';
    C.password.type = show ? 'text' : 'password';
    C.passwordConfirm.type = show ? 'text' : 'password';
    pwToggle.setAttribute('aria-pressed', String(show));
    pwToggle.textContent = show ? 'پنهان کردن رمز' : 'نمایش رمز';
  });

  // ---------- بخش‌های مراحل ----------
  const licenseBox = h('div', { class: 'license-fields' }, [
    field('reg-barassociation', 'کانون وکلای دادگستری یا مرجع صادرکنندهٔ پروانه', C.barAssociation, { required: true }), E.barAssociation,
    field('reg-licensenumber', 'شماره پروانه یا کارآموزی (اختیاری)', C.licenseNumber, { hint: 'فقط در صورت تمایل وارد کنید.' }), E.licenseNumber,
    field('reg-licenseyear', 'سال دریافت پروانه یا شروع کارآموزی (اختیاری)', C.licenseYear), E.licenseYear,
  ]);
  const panels = [
    h('section', { class: 'reg-step-body', 'aria-label': STEP_TITLES[0] }, [
      field('reg-displayname', 'نام و نام خانوادگی', C.displayName, { required: true }), E.displayName,
      field('reg-phone', 'شمارهٔ تلفن همراه', C.phone, { required: true, hint: 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹' }), E.phone,
      field('reg-email', 'نشانی ایمیل', C.email, { required: true, hint: 'لینک تأیید حساب به این نشانی ارسال می‌شود.' }), E.email,
      field('reg-province', 'استان محل فعالیت یا سکونت', C.province, { required: true }), E.province,
      field('reg-city', 'شهر', C.city, { required: true }), E.city,
      field('reg-password', 'رمز عبور (حداقل ۱۰ نویسه)', C.password, { required: true }), E.password,
      field('reg-passwordconfirm', 'تکرار رمز عبور', C.passwordConfirm, { required: true }), E.passwordConfirm,
      h('div', { class: 'row' }, [pwToggle]),
    ]),
    h('section', { class: 'reg-step-body', 'aria-label': STEP_TITLES[1] }, [
      h('p', { class: 'field-label', text: 'وضعیت حرفه‌ای *' }), C.professionalStatus, E.professionalStatus,
      licenseBox,
      field('reg-experienceband', 'میزان سابقهٔ فعالیت حرفه‌ای', C.experienceBand, { required: true }), E.experienceBand,
      h('p', { class: 'field-label', text: 'حوزه‌های فعالیت یا علاقهٔ تخصصی * (یک یا چند مورد)' }), C.practiceAreas, E.practiceAreas,
    ]),
    h('section', { class: 'reg-step-body', 'aria-label': STEP_TITLES[2] }, [
      field('reg-learninggoal', 'مهم‌ترین هدف شما از عضویت در آکادمی', C.learningGoal, { required: true }), E.learningGoal,
      h('p', { class: 'field-label', text: 'مهارت‌هایی که قصد تقویت آن‌ها را دارید * (یک یا چند مورد)' }), C.skillAreas, E.skillAreas,
      h('p', { class: 'field-label', text: 'سطح فعلی مهارت عملی *' }), C.skillLevel, E.skillLevel,
      h('p', { class: 'field-label', text: 'روش آموزشی ترجیحی *' }), C.learningFormat, E.learningFormat,
      field('reg-notes', 'توضیحات تکمیلی یا نیاز آموزشی ویژه (اختیاری)', C.notes), notesCount, E.notes,
    ]),
    h('section', { class: 'reg-step-body', 'aria-label': STEP_TITLES[3] }, []),
  ];
  const summary = h('dl', { class: 'review-summary' });
  const confirmBox = h('input', { type: 'checkbox', name: 'confirmAccuracy' });
  const confirmErr = errorFor('reg-confirm');
  panels[3].append(
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
  const val = () => {
    const radio = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value || '';
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    return {
      displayName: C.displayName.value.trim(),
      phone: C.phone.value.trim(),
      email: C.email.value.trim(),
      province: C.province.value,
      city: C.city.value.trim(),
      password: C.password.value,
      passwordConfirm: C.passwordConfirm.value,
      professionalStatus: radio('professionalStatus'),
      barAssociation: C.barAssociation.value.trim(),
      licenseNumber: C.licenseNumber.value.trim(),
      licenseYear: C.licenseYear.value.trim(),
      experienceBand: C.experienceBand.value,
      practiceAreas: checked('practiceAreas'),
      learningGoal: C.learningGoal.value,
      skillAreas: checked('skillAreas'),
      skillLevel: radio('skillLevel'),
      learningFormat: radio('learningFormat'),
      notes: C.notes.value.trim(),
    };
  };

  function validateStep(index) {
    const v = val();
    const e = {};
    if (index === 0) {
      if (v.displayName.length < 2 || v.displayName.length > 100) e.displayName = 'نام باید بین ۲ و ۱۰۰ نویسه باشد.';
      if (!normalizePhone(v.phone)) e.phone = 'شمارهٔ موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.';
      if (!EMAIL_RE.test(v.email) || v.email.length > 254) e.email = 'نشانی ایمیل معتبر نیست.';
      if (!v.province) e.province = 'استان را انتخاب کنید.';
      if (v.city.length < 2 || v.city.length > 60) e.city = 'نام شهر باید بین ۲ و ۶۰ نویسه باشد.';
      if (v.password.length < 10 || v.password.length > 128) e.password = 'رمز عبور باید بین ۱۰ و ۱۲۸ نویسه باشد.';
      else if (v.password !== v.passwordConfirm) e.passwordConfirm = 'تکرار رمز با رمز عبور یکی نیست.';
    } else if (index === 1) {
      if (!v.professionalStatus) e.professionalStatus = 'وضعیت حرفه‌ای را انتخاب کنید.';
      if (LICENSED_STATUSES.includes(v.professionalStatus)) {
        if (v.barAssociation.length < 2) e.barAssociation = 'نام کانون یا مرجع صادرکنندهٔ پروانه را وارد کنید.';
        if (v.licenseNumber && !/^[0-9A-Za-z؀-ۿ\-\/ ]+$/.test(toLatinDigits(v.licenseNumber)) || v.licenseNumber.length > 30) {
          e.licenseNumber = 'شماره پروانه معتبر نیست.';
        }
        if (v.licenseYear) {
          const y = Number(toLatinDigits(v.licenseYear));
          if (!Number.isInteger(y) || y < 1340 || y > 1420) e.licenseYear = 'سال معتبر نیست.';
        }
      }
      if (!v.experienceBand) e.experienceBand = 'میزان سابقه را انتخاب کنید.';
      if (v.practiceAreas.length < 1) e.practiceAreas = 'حداقل یک حوزه انتخاب کنید.';
    } else if (index === 2) {
      if (!v.learningGoal) e.learningGoal = 'هدف اصلی را انتخاب کنید.';
      if (v.skillAreas.length < 1) e.skillAreas = 'حداقل یک مهارت انتخاب کنید.';
      if (!v.skillLevel) e.skillLevel = 'سطح مهارت را انتخاب کنید.';
      if (!v.learningFormat) e.learningFormat = 'روش آموزشی را انتخاب کنید.';
      if (v.notes.length > 500) e.notes = 'توضیحات نباید بیش از ۵۰۰ نویسه باشد.';
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
    const control = C[key];
    const target = control?.tagName ? control : control?.querySelector?.('input');
    if (target) target.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearErrors() {
    for (const key of Object.keys(E)) setError(key, '');
    confirmErr.textContent = '';
    status.textContent = '';
  }

  function syncLicense() {
    licenseBox.hidden = !LICENSED_STATUSES.includes(val().professionalStatus);
  }

  function buildSummary() {
    const v = val();
    const rows = [
      ['نام و نام خانوادگی', v.displayName],
      ['شمارهٔ تلفن', fa(normalizePhone(v.phone) || v.phone)],
      ['ایمیل', v.email],
      ['محل فعالیت', `${v.province}، ${v.city}`],
      ['وضعیت حرفه‌ای', PROFESSIONAL_STATUS[v.professionalStatus]],
    ];
    if (LICENSED_STATUSES.includes(v.professionalStatus)) {
      rows.push(['کانون یا مرجع صدور', v.barAssociation]);
      rows.push(['شمارهٔ پروانه', v.licenseNumber || 'ثبت نشده']);
      rows.push(['سال دریافت', v.licenseYear ? fa(toLatinDigits(v.licenseYear)) : 'ثبت نشده']);
    }
    rows.push(
      ['سابقهٔ فعالیت', EXPERIENCE_BANDS[v.experienceBand]],
      ['حوزه‌های فعالیت', v.practiceAreas.map((k) => PRACTICE_AREAS[k]).join('، ')],
      ['هدف آموزشی', LEARNING_GOALS[v.learningGoal]],
      ['مهارت‌های موردنظر', v.skillAreas.map((k) => SKILL_AREAS[k]).join('، ')],
      ['سطح مهارت', SKILL_LEVELS[v.skillLevel]],
      ['روش آموزشی', LEARNING_FORMATS[v.learningFormat]],
    );
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
    syncLicense();
    heading.focus();
  }

  C.professionalStatus.addEventListener('change', syncLicense);

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
    // همهٔ مراحل پیش از ارسال بررسی می‌شوند؛ اولین مرحلهٔ خطادار نشان داده می‌شود.
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
    const payload = {
      displayName: v.displayName,
      email: v.email,
      password: v.password,
      profile: {
        phone: normalizePhone(v.phone),
        province: v.province,
        city: v.city,
        professionalStatus: v.professionalStatus,
        barAssociation: v.barAssociation,
        licenseNumber: v.licenseNumber,
        licenseYear: v.licenseYear,
        experienceBand: v.experienceBand,
        practiceAreas: v.practiceAreas,
        learningGoal: v.learningGoal,
        skillAreas: v.skillAreas,
        skillLevel: v.skillLevel,
        learningFormat: v.learningFormat,
        notes: v.notes,
      },
    };
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
      status.className = 'form-status err';
      status.textContent = messageFor('VALIDATION_FAILED');
      return;
    }
    status.className = 'form-status err';
    status.textContent = messageFor(res.networkError ? 'NETWORK' : res.data?.error);
  });

  renderStep(0);
  return form;
}
