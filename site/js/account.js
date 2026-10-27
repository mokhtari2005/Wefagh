// صفحات حساب کاربری: ورود، ثبت‌نام، تأیید ایمیل، و نمایش حساب. DOM امن (بدون innerHTML با داده).
import { postJson, getJson } from './api.js';
import { messageFor, REGISTER_SENT } from './auth-messages.js';

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
  });

  return form;
}

// ---------- ثبت‌نام ----------
export function registerForm({ onLoginLink }) {
  const displayName = h('input', { type: 'text', name: 'displayName', autocomplete: 'name', maxlength: '100', required: '' });
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', dir: 'ltr', maxlength: '254', required: '' });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'new-password', maxlength: '128', required: '' });
  password.setAttribute('minlength', '10');

  const errNodes = {
    displayName: fieldError('reg-name'),
    email: fieldError('reg-email'),
    password: fieldError('reg-password'),
  };
  const status = h('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'ساختن حساب' });

  const form = h('form', { class: 'form', novalidate: '', 'aria-label': 'فرم ثبت‌نام' }, [
    field('reg-name', 'نام نمایشی', displayName),
    errNodes.displayName,
    field('reg-email', 'ایمیل', email),
    errNodes.email,
    field('reg-password', 'رمز عبور (حداقل ۱۰ نویسه)', password),
    errNodes.password,
    submit,
    status,
    h('p', {}, [h('a', { href: '#/account', text: 'قبلاً حساب دارید؟ وارد شوید' })]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      displayName: displayName.value.trim(),
      email: email.value.trim(),
      password: password.value,
    };
    submit.disabled = true;
    setStatus(status, 'در حال ثبت…');
    const res = await postJson('/api/auth/register', values);
    submit.disabled = false;

    if (res.ok) {
      applyFieldErrors({}, errNodes);
      password.value = '';
      form.reset();
      // پاسخ عمومی: عمداً نمی‌گوید ایمیل تکراری بوده یا نه.
      setStatus(status, REGISTER_SENT, 'ok');
      return;
    }
    if (res.status === 422 && res.data?.errors) {
      applyFieldErrors(res.data.errors, errNodes);
      setStatus(status, messageFor('VALIDATION_FAILED'), 'err');
      return;
    }
    const code = res.networkError ? 'NETWORK' : res.data?.error;
    setStatus(status, messageFor(code), 'err');
  });

  return form;
}

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
    h('p', { dir: 'ltr', text: user.email }),
    user.roles?.length ? h('p', { class: 'muted', text: `نقش‌ها: ${user.roles.join('، ')}` }) : h('span'),
    logout,
    status,
  ]);
}
