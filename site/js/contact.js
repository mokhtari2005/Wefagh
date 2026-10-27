// فرم تماس: اعتبارسنجی سمت کاربر (راهنمای سریع) + ارسال. اعتبارسنجی نهایی در سرور انجام می‌شود.
import { postJson } from './api.js';

const TOPIC_LABELS = {
  general: 'پرسش عمومی',
  consulting: 'مشاوره حقوقی',
  academy: 'آکادمی و آموزش',
  media: 'رسانه و پادکست',
  cooperative: 'مشارکت صنفی',
  other: 'سایر',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientErrors(values) {
  const e = {};
  if (values.name.trim().length < 2) e.name = 'نام را وارد کنید (حداقل ۲ نویسه).';
  if (!EMAIL_RE.test(values.email.trim())) e.email = 'نشانی ایمیل معتبر نیست.';
  if (values.message.trim().length < 10) e.message = 'متن پیام حداقل ۱۰ نویسه باشد.';
  return e;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** فرم را با textContent و setAttribute می‌سازد؛ هیچ داده‌ای به‌صورت HTML درج نمی‌شود. */
export function mountContactForm(container) {
  const fields = {
    name: el('input', { id: 'c-name', name: 'name', type: 'text', autocomplete: 'name', required: '', maxlength: '100' }),
    email: el('input', { id: 'c-email', name: 'email', type: 'email', autocomplete: 'email', required: '', maxlength: '254', dir: 'ltr' }),
    topic: el('select', { id: 'c-topic', name: 'topic' }),
    message: el('textarea', { id: 'c-message', name: 'message', required: '', maxlength: '2000' }),
  };
  for (const [value, label] of Object.entries(TOPIC_LABELS)) {
    fields.topic.append(el('option', { value, text: label }));
  }

  const errorEls = {
    name: el('div', { class: 'error', id: 'e-name' }),
    email: el('div', { class: 'error', id: 'e-email' }),
    message: el('div', { class: 'error', id: 'e-message' }),
  };
  fields.name.setAttribute('aria-describedby', 'e-name');
  fields.email.setAttribute('aria-describedby', 'e-email');
  fields.message.setAttribute('aria-describedby', 'e-message');

  const status = el('p', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn', type: 'submit', text: 'ارسال پیام' });

  const form = el('form', { class: 'form', novalidate: '', 'aria-label': 'فرم تماس' }, [
    el('div', { class: 'field' }, [el('label', { for: 'c-name', text: 'نام و نام خانوادگی' }), fields.name, errorEls.name]),
    el('div', { class: 'field' }, [el('label', { for: 'c-email', text: 'ایمیل' }), fields.email, errorEls.email]),
    el('div', { class: 'field' }, [el('label', { for: 'c-topic', text: 'موضوع' }), fields.topic]),
    el('div', { class: 'field' }, [el('label', { for: 'c-message', text: 'پیام' }), fields.message, errorEls.message]),
    submit,
    status,
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      name: fields.name.value,
      email: fields.email.value,
      topic: fields.topic.value,
      message: fields.message.value,
    };

    const errs = clientErrors(values);
    for (const key of ['name', 'email', 'message']) {
      errorEls[key].textContent = errs[key] || '';
      fields[key].setAttribute('aria-invalid', errs[key] ? 'true' : 'false');
    }
    status.className = 'form-status';
    if (Object.keys(errs).length > 0) {
      status.textContent = 'لطفاً خطاهای فرم را اصلاح کنید.';
      status.classList.add('err');
      return;
    }

    submit.disabled = true;
    status.textContent = 'در حال ارسال…';
    const res = await postJson('/api/contact', values);
    submit.disabled = false;

    if (res.ok) {
      form.reset();
      status.textContent = 'پیام شما ثبت شد. به‌زودی با شما تماس گرفته می‌شود.';
      status.classList.add('ok');
      return;
    }

    status.classList.add('err');
    if (res.networkError) {
      status.textContent = 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.';
    } else if (res.status === 422 && res.data?.errors) {
      for (const [key, msg] of Object.entries(res.data.errors)) {
        if (errorEls[key]) errorEls[key].textContent = msg;
      }
      status.textContent = 'بعضی فیلدها نامعتبر هستند.';
    } else if (res.status === 429) {
      status.textContent = 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.';
    } else {
      status.textContent = 'خطایی رخ داد. لطفاً بعداً دوباره تلاش کنید یا به ایمیل گروه بنویسید.';
    }
  });

  container.replaceChildren(form);
}
