// صفحات حساب کاربری: ورود، ثبت‌نام، تأیید ایمیل، و نمایش حساب. DOM امن (بدون innerHTML با داده).
import { postJson, getJson } from './api.js';
import { messageFor } from './auth-messages.js';
import { changePasswordForm, profileEditForm } from './account-manage.js';
import { PROFESSIONAL_STATUS, EXPERIENCE_BANDS, PRACTICE_AREAS, LEARNING_GOALS, SKILL_AREAS, LEARNING_FORMATS, toLatinDigits } from './registration-options.js';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function setStatus(node, text, kind) {
  node.className = `form-status${kind ? ` ${kind}` : ''}`;
  node.textContent = text;
}

function field(id, label, input) {
  input.id = id;
  return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input]);
}

function fieldError(id) {
  return h('div', { class: 'error', id: `${id}-err` });
}

/** خطاهای فیلدی را در محل خودشان نشان می‌دهد. */
function applyFieldErrors(errors, errorNodes) {
  for (const [key, node] of Object.entries(errorNodes)) {
    node.textContent = errors?.[key] || '';
  }
}

// ---------- ورود ----------
export function loginForm({ onSuccess, onRegister }) {
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', dir: 'ltr', required: '' });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: '' });
  const emailErr = fieldError('login-email');
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'ورود' });

  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'فرم ورود' }, [
    field('login-email', 'ایمیل', email),
    emailErr,
    field('login-password', 'رمز عبور', password),
    submit,
    status,
    h('p', {}, [
      h('a', { href: '#/account?mode=register', text: 'حساب ندارید؟ ثبت‌نام کنید' }),
    ]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = { email: email.value.trim(), password: password.value };
    if (!values.email || !values.password) {
      emailErr.textContent = !values.email ? 'ایمیل را وارد کنید.' : '';
      setStatus(status, 'ایمیل و رمز عبور را وارد کنید.', 'err');
      return;
    }
    submit.disabled = true;
    setStatus(status, 'در حال ورود…');
    const res = await postJson('/api/auth/login', values);
    submit.disabled = false;
    if (res.ok) {
      password.value = '';
      onSuccess();
      return;
    }
    const code = res.networkError ? 'NETWORK' : res.data?.error;
    setStatus(status, messageFor(code), 'err');
    password.value = '';
    if (code === 'EMAIL_NOT_VERIFIED') showResend(values.email);
  });

  // ارسال مجدد لینک تأیید برای حساب تأییدنشده. پاسخ سرور همیشه عمومی است.
  function showResend(address) {
    if (form.querySelector('.resend-verification')) return;
    const btn = h('button', { class: 'btn resend-verification', type: 'button', text: 'ارسال مجدد ایمیل تأیید' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await postJson('/api/auth/resend-verification', { email: address });
      setStatus(status, r.ok ? (r.data?.message || 'ایمیل تأیید ارسال شد.') : messageFor(r.networkError ? 'NETWORK' : r.data?.error), r.ok ? 'ok' : 'err');
      setTimeout(() => { btn.disabled = false; }, 60 * 1000);
    });
    submit.after(btn);
  }

  return form;
}

// فرم ثبت‌نام چندمرحله‌ای در register.js است.
export { registerForm } from './register.js';

// ---------- تأیید ایمیل (از لینک ایمیل) ----------
export async function verifyPanel(token) {
  const wrap = h('div', {}, [h('h1', { text: 'تأیید ایمیل' })]);
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite', text: 'در حال تأیید…' });
  wrap.append(status);

  if (!token) {
    setStatus(status, messageFor('INVALID_TOKEN'), 'err');
    return wrap;
  }
  const res = await postJson('/api/auth/verify-email', { token });
  if (res.ok) {
    setStatus(status, 'ایمیل شما تأیید شد. اکنون می‌توانید وارد شوید.', 'ok');
    wrap.append(h('p', {}, [h('a', { href: '#/account', text: 'ورود به حساب' })]));
  } else {
    setStatus(status, messageFor(res.networkError ? 'NETWORK' : res.data?.error), 'err');
  }
  return wrap;
}

// ---------- حساب من ----------
/** خلاصهٔ پروفایل ثبت‌نام؛ فقط برای خود کاربر نمایش داده می‌شود. */
function profileSummary(p) {
  const list = (keys, map) => keys.map((k) => map[k]).filter(Boolean).join('، ') || '—';
  const rows = [
    ['شمارهٔ تلفن', toLatinDigits(p.phone)],
    ['محل فعالیت', `${p.province}، ${p.city}`],
    ['وضعیت حرفه‌ای', PROFESSIONAL_STATUS[p.professionalStatus]],
    ['سابقه', EXPERIENCE_BANDS[p.experienceBand]],
    ['حوزه‌های فعالیت', list(p.practiceAreas, PRACTICE_AREAS)],
    ['هدف آموزشی', LEARNING_GOALS[p.learningGoal]],
    ['مهارت‌های موردنظر', list(p.skillAreas, SKILL_AREAS)],
    ['روش آموزشی', LEARNING_FORMATS[p.learningFormat]],
  ];
  const summary = h('dl', { class: 'review-summary account-profile-grid' }, rows.map(([k, v]) => h('div', { class: 'review-row account-profile-item' }, [h('dt', { text: k }), h('dd', { text: v || '—' })])));
  return h('section', { class: 'account-profile', 'aria-labelledby': 'account-profile-title' }, [
    h('header', { class: 'account-profile-heading' }, [
      h('div', { class: 'account-profile-mark', 'aria-hidden': 'true', text: '⚖' }),
      h('div', {}, [
        h('h2', { id: 'account-profile-title', text: 'پروفایل آموزشی' }),
        h('p', { class: 'muted', text: 'اطلاعات حرفه‌ای و ترجیحات یادگیری شما' }),
      ]),
      h('span', { class: 'account-profile-status', text: 'اطلاعات حساب' }),
    ]),
    summary,
  ]);
}


function avatarEditor(currentUrl) {
  const wrap = h('section', { class: 'profile-avatar-editor' });
  const preview = h('img', { class: 'profile-avatar-preview', alt: 'تصویر پروفایل', ...(currentUrl ? { src: currentUrl } : {}) });
  if (!currentUrl) preview.hidden = true;
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'انتخاب عکس پروفایل' });
  const save = h('button', { class: 'btn small', type: 'button', text: 'بارگذاری عکس' });
  const remove = h('button', { class: 'btn small secondary', type: 'button', text: 'حذف عکس' });
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  wrap.append(h('h2', { text: 'عکس پروفایل' }), preview, file, h('p', { class: 'muted', text: 'فرمت JPG، PNG یا WebP؛ حداکثر ۳۵۰ کیلوبایت. عکس فقط در نمای شخصی حساب و صفحهٔ اصلیِ همان کاربر نمایش داده می‌شود.' }), h('div', { class: 'row' }, [save, remove]), status);
  save.addEventListener('click', async () => {
    const selected = file.files?.[0];
    if (!selected) { setStatus(status, 'ابتدا یک عکس انتخاب کنید.', 'err'); return; }
    if (selected.size > 350 * 1024) { setStatus(status, 'حجم عکس نباید بیشتر از ۳۵۰ کیلوبایت باشد.', 'err'); return; }
    const data = new FormData(); data.append('avatar', selected);
    save.disabled = true; setStatus(status, 'در حال بارگذاری…');
    try {
      const response = await fetch('/api/me/avatar', { method: 'POST', credentials: 'same-origin', body: data, headers: { Accept: 'application/json' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'بارگذاری عکس ناموفق بود.');
      preview.src = result.avatarDataUrl; preview.hidden = false;
      setStatus(status, 'عکس پروفایل ذخیره شد. برای نمایش آن در صفحهٔ اصلی، صفحه را تازه‌سازی کنید.', 'ok');
    } catch (err) { setStatus(status, err.message || 'ارتباط با سرور برقرار نشد.', 'err'); }
    finally { save.disabled = false; }
  });
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    try {
      const response = await fetch('/api/me/avatar', { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('حذف عکس انجام نشد.');
      preview.removeAttribute('src'); preview.hidden = true; file.value = '';
      setStatus(status, 'عکس پروفایل حذف شد.', 'ok');
    } catch (err) { setStatus(status, err.message, 'err'); }
    finally { remove.disabled = false; }
  });
  return wrap;
}

export async function accountPanel({ onLogout }) {
  const res = await getJson('/api/me');
  if (!res.ok) return null;
  const user = res.data?.user;
  if (!user) return null;

  const logout = h('button', { class: 'btn', type: 'button', text: 'خروج از حساب' });
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    const out = await postJson('/api/auth/logout', {});
    logout.disabled = false;
    if (out.ok) onLogout();
    else setStatus(status, messageFor(out.networkError ? 'NETWORK' : out.data?.error), 'err');
  });

  return h('div', {}, [
    h('h1', { text: 'حساب من' }),
    h('p', { text: `نام: ${user.displayName}` }),
    avatarEditor(user.profile?.avatarDataUrl),
    h('p', { text: `شماره عضویت: ${user.membershipNo || 'در انتظار تخصیص'}` }),
    h('p', { text: `عنوان: ${user.professionalTitle || '—'} | سمت: ${user.position || '—'}` }),
    h('p', { dir: 'ltr', text: user.email }),
    user.profile?.phone ? profileSummary(user.profile) : h('p', { class: 'muted', text: 'پروفایل آموزشی برای این حساب ثبت نشده است.' }),
    h('details', { class: 'account-edit' }, [
      h('summary', { text: 'ویرایش پروفایل آموزشی' }),
      // پس از ذخیرهٔ موفق، صفحهٔ حساب دوباره ساخته می‌شود تا خلاصهٔ پروفایل به‌روز شود.
      profileEditForm(user.profile, () => window.dispatchEvent(new Event('hashchange'))),
    ]),
    h('details', { class: 'account-edit' }, [
      h('summary', { text: 'تغییر رمز عبور' }),
      changePasswordForm(),
    ]),
    user.roles?.length ? h('p', { class: 'muted', text: `نقش‌ها: ${user.roles.join('، ')}` }) : h('span'),
    user.roles?.some((role) => ['admin', 'super_admin', 'academy_manager', 'media_editor'].includes(role)) ? h('p', {}, [h('a', { class: 'btn secondary', href: '#/admin', text: 'ورود به مدیریت محتوا' })]) : h('span'),
    logout,
    status,
  ]);
}
