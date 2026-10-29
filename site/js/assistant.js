// دستیار هوشمند وکیل: تنظیم پیش‌نویس، تحلیل پرونده و بازبینی متن. فقط برای کاربر واردشده و وقتی سرویس فعال است.
import { h } from './dom.js';
import { getJson, postJson } from './api.js';
import { aiStatus, errorText } from './ai-client.js';

export const DOC_TYPES = [
  ['petition', 'پیش‌نویس دادخواست'], ['defense', 'پیش‌نویس لایحه دفاعیه'], ['appeal', 'لایحه تجدیدنظرخواهی'],
  ['cassation', 'لایحه فرجام‌خواهی'], ['enforcement', 'درخواست و لایحهٔ اجرایی'], ['notice', 'اظهارنامه'],
  ['criminal_complaint', 'شکواییه و دفاعیات کیفری'], ['reply', 'پاسخ به دادخواست یا لایحهٔ طرف مقابل'],
  ['contract', 'تنظیم یا بازنویسی قرارداد'], ['judicial_request', 'درخواست قضایی متناسب با موضوع'],
  ['letter', 'نامهٔ رسمی و مکاتبهٔ حقوقی'],
];
export const MODES = [['draft', 'تنظیم سند'], ['analyze', 'تحلیل حقوقی پرونده'], ['review', 'بررسی و اصلاح متن']];

export const ASSISTANT_NOTICE = 'این ابزار آموزشی و پیش‌نویس‌ساز است. خروجی آن پیش از هر استفاده در پرونده واقعی باید توسط وکیل با قوانین و مقررات جاری و رویهٔ معتبر تطبیق داده شود. اطلاعات پرونده در این بخش فقط برای تولید پاسخ به سرویس هوش مصنوعی فرستاده می‌شود.';

/** پیام‌های کاربر و پاسخ دستیار به شکل متن برای ارسال دوباره به سرور (محدود به ۱۰ مورد آخر). */
export function trimHistory(history) {
  return history.slice(-10).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, 6000) }));
}

/** متن پاسخ دستیار برای تاریخچه: پرسش‌های تکمیلی یا متن پیش‌نویس. */
export function summarizeReply(data) {
  if (data.status === 'need_info') {
    return ['برای ادامه این اطلاعات لازم است:', ...(data.questions || []).map((q) => `- ${q}`)].join('\n');
  }
  return data.text || '';
}

export function assistantPage() {
  const wrap = h('div', { class: 'assistant' }, [
    h('span', { class: 'section-kicker', text: 'آکادمی وفاق · ابزار حرفه‌ای' }),
    h('h1', { text: 'دستیار هوشمند وکیل' }),
    h('p', { class: 'lead', text: 'برای تنظیم پیش‌نویس اسناد، تحلیل پرونده و بازبینی متن حقوقی.' }),
    h('div', { class: 'notice', role: 'note', text: ASSISTANT_NOTICE }),
  ]);
  const body = h('div', { role: 'region', 'aria-live': 'polite' }, [h('p', { class: 'muted', text: 'در حال بررسی دسترسی…' })]);
  wrap.append(body);

  (async () => {
    const [me, status] = await Promise.all([getJson('/api/me'), aiStatus()]);
    if (!me.ok) {
      body.replaceChildren(h('div', { class: 'notice', role: 'note' }, [
        h('p', { text: 'برای استفاده از دستیار، ابتدا وارد حساب خود شوید.' }),
        h('p', {}, [h('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })]),
      ]));
      return;
    }
    if (!status.configured) {
      body.replaceChildren(h('div', { class: 'notice', role: 'note', text: 'سرویس دستیار هنوز روی سرور فعال نشده است. پس از فعال‌سازی، این بخش آماده استفاده می‌شود.' }));
      return;
    }
    body.replaceChildren(assistantWorkspace());
  })();
  return wrap;
}

function assistantWorkspace() {
  const history = [];
  let busy = false;

  const modeSelect = h('select', { 'aria-label': 'نوع کار' }, MODES.map(([v, t]) => h('option', { value: v, text: t })));
  const docSelect = h('select', { 'aria-label': 'نوع سند' }, DOC_TYPES.map(([v, t]) => h('option', { value: v, text: t })));
  const message = h('textarea', { rows: '6', maxlength: '6000', 'aria-label': 'شرح پرونده یا متن', placeholder: 'موضوع دعوا، سمت موکل، مرجع رسیدگی، مرحله، خواسته، وقایع و دلایل موجود را بنویسید…' });
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const sendBtn = h('button', { class: 'btn', type: 'button', text: 'ارسال' });
  const resetBtn = h('button', { class: 'btn secondary', type: 'button', text: 'گفت‌وگوی تازه' });
  const log = h('ol', { class: 'assistant-log', 'aria-label': 'گفت‌وگو' });
  const output = h('section', { class: 'assistant-output', hidden: '' });
  const outputText = h('textarea', { rows: '16', 'aria-label': 'متن پیش‌نویس (قابل ویرایش)' });
  const copyBtn = h('button', { class: 'btn secondary', type: 'button', text: 'کپی متن' });
  const downloadBtn = h('button', { class: 'btn secondary', type: 'button', text: 'دریافت فایل متنی' });
  const outputNotice = h('p', { class: 'muted' });
  output.append(h('h2', { text: 'متن پیش‌نویس' }), outputText, h('div', { class: 'row' }, [copyBtn, downloadBtn]), outputNotice);

  const docLabel = h('label', {}, [document.createTextNode('نوع سند: '), docSelect]);
  const modeLabel = h('label', {}, [document.createTextNode('نوع کار: '), modeSelect]);
  function syncDocVisibility() {
    docLabel.hidden = modeSelect.value !== 'draft';
  }
  modeSelect.addEventListener('change', syncDocVisibility);
  syncDocVisibility();

  function renderLog() {
    log.replaceChildren(...history.map((m) => h('li', { class: m.role === 'ai' ? 'assistant-ai' : 'assistant-user' }, [
      h('strong', { text: m.role === 'ai' ? 'دستیار: ' : 'شما: ' }),
      h('span', { class: 'pre-wrap', text: m.text }),
    ])));
  }

  function showOutput(text, disclaimer) {
    output.hidden = !text;
    outputText.value = text;
    outputNotice.textContent = disclaimer || '';
  }

  sendBtn.addEventListener('click', async () => {
    if (busy) return;
    const text = message.value.trim();
    if (!text) { status.textContent = 'ابتدا شرح پرونده یا متن را بنویسید.'; return; }
    busy = true;
    sendBtn.disabled = true;
    status.textContent = 'در حال پردازش… این کار ممکن است چند ثانیه طول بکشد.';
    const payload = { mode: modeSelect.value, message: text, history: trimHistory(history) };
    if (payload.mode === 'draft') payload.docType = docSelect.value;
    const res = await postJson('/api/ai/assistant', payload, { timeoutMs: 60000 });
    busy = false;
    sendBtn.disabled = false;
    if (!res.ok || !res.data?.ok) {
      status.textContent = `${errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE'))} متن شما در کادر باقی ماند.`;
      return;
    }
    history.push({ role: 'user', text });
    const reply = summarizeReply(res.data);
    history.push({ role: 'ai', text: reply });
    message.value = '';
    renderLog();
    if (res.data.status === 'ready') {
      showOutput(res.data.text, res.data.disclaimer);
      status.textContent = 'پیش‌نویس آماده است. آن را بررسی و ویرایش کنید.';
    } else {
      status.textContent = 'برای تکمیل، پاسخ پرسش‌های بالا را بنویسید.';
    }
  });

  resetBtn.addEventListener('click', () => {
    history.length = 0;
    renderLog();
    showOutput('', '');
    message.value = '';
    status.textContent = '';
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(outputText.value);
      status.textContent = 'متن کپی شد.';
    } catch {
      status.textContent = 'کپی انجام نشد؛ متن را دستی انتخاب کنید.';
    }
  });

  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([`${outputText.value}\n\n${outputNotice.textContent}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'pish-navis-vefagh.txt' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return h('div', { class: 'assistant-workspace' }, [
    h('div', { class: 'row' }, [modeLabel, docLabel]),
    message,
    h('div', { class: 'row' }, [sendBtn, resetBtn]),
    status,
    log,
    output,
  ]);
}
