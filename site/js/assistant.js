// دستیار هوشمند وکیل: گفت‌وگوی حرفه‌ای با تاریخچه، کادر ارسال ثابت و بارگذاری متن سند.
// فقط برای کاربر واردشده و وقتی سرویس روی سرور فعال است. هر دکمه‌ای که نشان داده می‌شود عملکرد واقعی دارد.
import { h } from './dom.js';
import { icon } from './icons.js';
import { getJson, postJson, postForm, sendJson } from './api.js';
import { aiStatus, errorText } from './ai-client.js';
import { formatShamsi } from './shamsi.js';

export const DOC_TYPES = [
  ['petition', 'پیش‌نویس دادخواست'], ['defense', 'پیش‌نویس لایحه دفاعیه'], ['appeal', 'لایحه تجدیدنظرخواهی'],
  ['cassation', 'لایحه فرجام‌خواهی'], ['enforcement', 'درخواست و لایحهٔ اجرایی'], ['notice', 'اظهارنامه'],
  ['criminal_complaint', 'شکواییه و دفاعیات کیفری'], ['reply', 'پاسخ به دادخواست یا لایحهٔ طرف مقابل'],
  ['contract', 'تنظیم یا بازنویسی قرارداد'], ['judicial_request', 'درخواست قضایی متناسب با موضوع'],
  ['letter', 'نامهٔ رسمی و مکاتبهٔ حقوقی'], ['other', 'سایر اسناد (تحلیل و بررسی)'],
];
export const CONTRACT_TYPES = Object.freeze([
  ['sale', 'بیع و خریدوفروش (اموال منقول و غیرمنقول)'],
  ['real_estate_sale', 'مبایعه‌نامه ملک و آپارتمان'],
  ['lease', 'اجاره‌نامه املاک مسکونی و تجاری'],
  ['vehicle_sale', 'خریدوفروش خودرو و وسایل نقلیه'],
  ['promise_sale', 'تعهد به بیع و قرارداد پیش‌فروش'],
  ['construction', 'مشارکت در ساخت و قراردادهای ساختمانی'],
  ['investment', 'سرمایه‌گذاری و مشارکت مدنی'],
  ['partnership', 'مشارکت و همکاری تجاری'],
  ['company', 'توافق‌نامه شرکا و سهام‌داران'],
  ['share_transfer', 'انتقال سهام و سهم‌الشرکه'],
  ['joint_venture', 'مشارکت در پروژه و سرمایه‌گذاری مشترک'],
  ['agency', 'وکالت و نمایندگی'],
  ['commission', 'حق‌العمل‌کاری و عاملیت فروش'],
  ['distribution', 'توزیع، پخش و عاملیت تجاری'],
  ['employment', 'قرارداد کار و استخدام'],
  ['consulting', 'مشاوره و خدمات تخصصی'],
  ['services', 'ارائه خدمات و پیمانکاری'],
  ['contracting', 'پیمانکاری و اجرای پروژه'],
  ['manufacturing', 'ساخت، تولید و سفارش کالا'],
  ['supply', 'تأمین و فروش کالا و تجهیزات'],
  ['transport', 'حمل‌ونقل و باربری'],
  ['maintenance', 'نگهداری، تعمیرات و پشتیبانی'],
  ['software', 'طراحی نرم‌افزار و خدمات فناوری اطلاعات'],
  ['license', 'مجوز بهره‌برداری و انتقال دانش فنی'],
  ['nda', 'محرمانگی و عدم افشای اطلاعات'],
  ['ip', 'انتقال یا اعطای مجوز مالکیت فکری'],
  ['loan', 'قرض و قراردادهای تأمین مالی'],
  ['guarantee', 'ضمانت، تعهد و وثیقه'],
  ['settlement', 'صلح، سازش و تسویه‌حساب'],
  ['debt_acknowledgment', 'اقرار به دین و تعهد به پرداخت'],
  ['gift', 'هبه و صلح بلاعوض'],
  ['deposit', 'ودیعه و امانت'],
  ['franchise', 'فرانچایز و اعطای امتیاز کسب‌وکار'],
  ['ecommerce', 'فروش اینترنتی و تجارت الکترونیکی'],
  ['custom', 'سایر قراردادها / قرارداد اختصاصی'],
]);
export const MODES = [['consult', 'مشاوره حقوقی'], ['draft', 'تنظیم سند'], ['analyze', 'تحلیل حقوقی پرونده'], ['review', 'بررسی و اصلاح متن']];

export const ASSISTANT_NOTICE = 'این ابزار آموزشی و پیش‌نویس‌ساز است. خروجی آن پیش از هر استفاده در پرونده واقعی باید توسط وکیل با قوانین و مقررات جاری و رویهٔ معتبر تطبیق داده شود. اطلاعات پرونده در این بخش فقط برای تولید پاسخ به سرویس هوش مصنوعی فرستاده می‌شود.';

const MESSAGE_LIMIT = 6000;

/** پاک‌سازی نشانه‌های ظاهری Markdown بدون دست‌زدن به شماره‌گذاری و استنادهای حقوقی. */
function cleanModelOutput(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\\r\\n?/g, '\\n')
    .replace(/^```(?:[a-z0-9_-]+)?\\s*/gim, '').replace(/^```\\s*$/gm, '')
    .replace(/^\\s{0,3}#{1,6}\\s*/gm, '').replace(/^\\s*[─━═_*—]{3,}\\s*$/gm, '')
    .replace(/\\*\\*(.*?)\\*\\*/gs, '$1').replace(/__(.*?)__/gs, '$1')
    .replace(/`([^`]+)`/g, '$1').replace(/^\\s*[-*+]\\s+/gm, '')
    .replace(/[ \\t]+$/gm, '').replace(/\\n{3,}/g, '\\n\\n').trim();
}
async function copyAssistantText(value) {
  if (navigator.clipboard?.writeText && window.isSecureContext) return navigator.clipboard.writeText(value);
  const field = document.createElement('textarea'); field.value = value; field.setAttribute('readonly', '');
  field.style.position = 'fixed'; field.style.opacity = '0'; field.style.insetInlineStart = '-9999px';
  document.body.append(field); field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
  const copied = document.execCommand('copy'); field.remove(); if (!copied) throw new Error('COPY_FAILED');
}

// پیوست‌ها: همین حدها در سرور (worker/src/ai/attachments.js) اعمال می‌شود؛ سرور مرجع نهایی است.
export const ATTACH_LIMITS = Object.freeze({ files: 3, fileBytes: 8 * 1024 * 1024, textFileBytes: 512 * 1024, totalBytes: 12 * 1024 * 1024 });
export const ATTACH_TYPES = Object.freeze({
  pdf: 'PDF', docx: 'Word', jpg: 'تصویر', jpeg: 'تصویر', png: 'تصویر', webp: 'تصویر', txt: 'متن', md: 'Markdown', csv: 'CSV',
});
export const ATTACH_ACCEPT = Object.keys(ATTACH_TYPES).map((e) => `.${e}`).join(',');
const TEXT_EXTS = new Set(['txt', 'md', 'csv']);
export const ATTACH_PRIVACY_NOTE = 'فایل‌های پیوست برای تحلیل به سرویس هوش مصنوعی (Gemini) فرستاده می‌شوند و در تاریخچه ذخیره نمی‌شوند. پیش از ارسال، نام و مشخصات هویتی موکل و اطلاعات محرمانه را حذف یا ناشناس کنید.';

export function fileExt(name) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name ?? '').trim());
  return m ? m[1].toLowerCase() : '';
}

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('fa-IR')} کیلوبایت`;
}

/**
 * بررسی سریع پیش از افزودن فایل (برای بازخورد فوری). خطاها همان کدهای سرور هستند و با errorText نمایش داده می‌شوند.
 * @returns {{ok:true, label:string} | {ok:false, code:string}}
 */
export function checkNewFile(file, current = []) {
  const ext = fileExt(file?.name);
  if (!Object.hasOwn(ATTACH_TYPES, ext)) return { ok: false, code: 'UNSUPPORTED_FILE_TYPE' };
  if (!file.size) return { ok: false, code: 'FILE_EMPTY' };
  if (current.length >= ATTACH_LIMITS.files) return { ok: false, code: 'TOO_MANY_FILES' };
  const limit = TEXT_EXTS.has(ext) ? ATTACH_LIMITS.textFileBytes : ATTACH_LIMITS.fileBytes;
  const total = current.reduce((sum, a) => sum + a.file.size, 0) + file.size;
  if (file.size > limit || total > ATTACH_LIMITS.totalBytes) return { ok: false, code: 'FILE_TOO_LARGE' };
  return { ok: true, label: ATTACH_TYPES[ext] };
}
const SUGGESTIONS = [
  ['consult', 'other', 'مهلت تجدیدنظرخواهی از رأی دادگاه بدوی چقدر است و از چه تاریخی شروع می‌شود؟'],
  ['consult', 'other', 'برای مطالبهٔ وجه چک برگشتی، شکایت کیفری بهتر است یا دادخواست حقوقی؟'],
  ['draft', 'petition', 'دادخواست مطالبهٔ وجه چک برگشتی را پیش‌نویس کن.'],
  ['analyze', 'petition', 'نقاط قوت و ضعف این پرونده را تحلیل کن: ...'],
  ['review', 'petition', 'این متن لایحه را از نظر ساختار و استدلال بازبینی کن: ...'],
];

/** پیام‌های کاربر و پاسخ دستیار به شکل متن برای ارسال دوباره به سرور (محدود به ۱۰ مورد آخر). */
export function trimHistory(history) {
  return history.slice(-10).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, MESSAGE_LIMIT) }));
}

/** متن پاسخ دستیار برای تاریخچه: پرسش‌های تکمیلی یا متن پیش‌نویس. */
export function summarizeReply(data) {
  if (data.status === 'need_info') {
    return ['برای ادامه این اطلاعات لازم است:', ...(data.questions || []).map((q) => `- ${q}`)].join('\n');
  }
  return data.text || '';
}

export function assistantPage(params = {}) {
  const wrap = h('div', { class: 'assistant' }, [
    h('h1', { text: 'دستیار هوشمند وکیل' }),
    h('details', { class: 'ai-notice' }, [
      h('summary', { text: 'ابزار آموزشی و پیش‌نویس‌ساز است؛ پیش از استفاده باید وکیل آن را تطبیق دهد (جزئیات)' }),
      h('p', { class: 'muted', text: ASSISTANT_NOTICE }),
    ]),
  ]);
  const body = h('div', { role: 'region', 'aria-live': 'polite' }, [h('p', { class: 'muted', text: 'در حال بررسی دسترسی…' })]);
  wrap.append(body);

  (async () => {
    const [me, status, settings] = await Promise.all([getJson('/api/me'), aiStatus(), getJson('/api/access-settings').catch(() => ({ ok: false }))]);
    const guestMode = !me.ok && settings.ok && settings.data?.registrationRequired === false;
    if (!me.ok && !guestMode) {
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
    body.replaceChildren(assistantWorkspace(guestMode ? null : params.thread, guestMode));
  })();
  return wrap;
}

/** متن یک پیام را به‌صورت فایل متنی دانلود می‌کند. */
function downloadText(text, name) {
  const blob = new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function assistantWorkspace(initialThread, guestMode = false) {
  const history = [];
  let busy = false;
  let threadId = null;
  let attachments = []; // [{ file, label }]

  // ---------- بازیابی یک گفت‌وگو (فهرست سوابق در صفحهٔ جدا: #/assistant/history) ----------
  async function loadThread(id) {
    const res = await getJson(`/api/ai/threads/${encodeURIComponent(id)}/messages`);
    if (!res.ok) { status.textContent = 'بازیابی گفت‌وگو انجام نشد.'; return; }
    history.length = 0;
    for (const m of res.data?.messages || []) history.push({ role: m.role === 'ai' ? 'ai' : 'user', text: m.content });
    threadId = Number(id);
    renderLog();
    status.textContent = 'گفت‌وگو بازیابی شد. ادامه دهید.';
  }

  async function persistTurn(userText, aiText) {
    if (guestMode) return true; // تاریخچهٔ مهمان فقط در حافظهٔ همین صفحه می‌ماند.
    if (!threadId) {
      const created = await postJson('/api/ai/threads', { title: userText.slice(0, 60) });
      if (!created.ok || !created.data?.thread?.id) return false;
      threadId = created.data.thread.id;
    }
    const a = await postJson(`/api/ai/threads/${threadId}/messages`, { role: 'user', content: userText });
    const b = await postJson(`/api/ai/threads/${threadId}/messages`, { role: 'ai', content: aiText });
    return a.ok && b.ok;
  }

  // ---------- حالت و نوع سند ----------
  let mode = 'consult';
  const modeGroup = h('div', { class: 'ai-seg', role: 'group', 'aria-label': 'نوع کار' });
  const modeIcons = { consult: 'scale', draft: 'edit', analyze: 'search', review: 'clipboard-list' };
  const modeButtons = MODES.map(([value, label]) => {
    const b = h('button', { class: 'ai-seg-btn', type: 'button', 'aria-label': label }, [
      h('span', { class: 'ai-mode-icon', 'aria-hidden': 'true' }, [icon(modeIcons[value], { size: 19 })]),
      h('span', { class: 'ai-mode-label', text: label }),
    ]);
    b.setAttribute('aria-pressed', value === mode ? 'true' : 'false');
    b.addEventListener('click', () => {
      mode = value;
      syncMode();
    });
    return b;
  });
  const contractModeButton = h('button', { class: 'ai-seg-btn ai-contract-mode', type: 'button', 'aria-label': 'تنظیم قرارداد' }, [
    h('span', { class: 'ai-mode-icon', 'aria-hidden': 'true' }, [icon('file-text', { size: 19 })]),
    h('span', { class: 'ai-mode-label', text: 'تنظیم قراردادها' }),
  ]);
  contractModeButton.addEventListener('click', () => {
    mode = 'draft';
    docSelect.value = 'contract';
    syncMode();
  });
  modeGroup.append(...modeButtons, contractModeButton);
  const docSelect = h('select', { 'aria-label': 'نوع سند' }, DOC_TYPES.map(([v, t]) => h('option', { value: v, text: t })));
  const docWrap = h('label', { class: 'ai-doc-picker' }, [h('span', { text: 'نوع سند' }), docSelect]);
  const contractSelect = h('select', { 'aria-label': 'نوع قرارداد' }, [
    h('option', { value: '', text: 'انتخاب نوع قرارداد…' }),
    ...CONTRACT_TYPES.map(([v, t]) => h('option', { value: v, text: t })),
  ]);
  const contractWrap = h('label', { class: 'ai-doc-picker ai-contract-picker', hidden: '' }, [
    h('span', { text: 'نوع قرارداد' }), contractSelect,
  ]);
  docSelect.addEventListener('change', () => {
    syncContractPicker();
    syncContractModeButton();
  });
  function syncContractModeButton() {
    contractModeButton.setAttribute('aria-pressed', mode !== 'consult' && docSelect.value === 'contract' ? 'true' : 'false');
  }
  function syncContractPicker() {
    contractWrap.hidden = mode === 'consult' || docSelect.value !== 'contract';
    syncContractModeButton();
  }
  const PLACEHOLDERS = {
    consult: 'پرسش حقوقی یا قضایی خود را بنویسید؛ هرچه جزئیات (مرجع، مرحله، تاریخ‌ها) دقیق‌تر باشد پاسخ دقیق‌تر است…',
    other: 'موضوع دعوا، سمت موکل، مرجع رسیدگی، مرحله، خواسته، وقایع و دلایل موجود…',
  };
  function syncMode() {
    modeButtons.forEach((x, i) => x.setAttribute('aria-pressed', MODES[i][0] === mode && docSelect.value !== 'contract' ? 'true' : 'false'));
    docWrap.hidden = mode === 'consult';
    composerText.placeholder = mode === 'consult' ? PLACEHOLDERS.consult : PLACEHOLDERS.other;
    syncContractPicker();
    renderSuggestions();
  }

  // ---------- گفت‌وگو ----------
  const suggestionsBox = h('div', { class: 'ai-suggestions' });
  function renderSuggestions() {
    // فقط نمونه‌های همین حالت نشان داده می‌شود تا صفحه کوتاه بماند.
    suggestionsBox.replaceChildren(...SUGGESTIONS.filter(([m]) => m === mode).map(([m, d, text]) => {
      const b = h('button', { class: 'btn secondary ai-suggestion', type: 'button', text });
      b.addEventListener('click', () => {
        docSelect.value = d;
        composerText.value = text;
        composerText.focus();
      });
      return b;
    }));
  }
  const emptyState = h('div', { class: 'ai-empty' }, [
    h('p', { class: 'muted', text: 'پرسش یا شرح پرونده را بنویسید؛ اگر منبع معتبری نباشد، پاسخ صریحاً همین را می‌گوید.' }),
    suggestionsBox,
  ]);
  const pendingTitle = h('strong', { class: 'ai-pending-title', text: 'در حال آماده‌سازی پاسخ حقوقی…' });
  const pendingElapsed = h('span', { class: 'ai-progress-elapsed', text: 'زمان سپری‌شده: ۰:۰۰' });
  const pendingRemaining = h('span', { class: 'ai-progress-remaining', text: 'زمان تخمینی باقی‌مانده: ۱:۰۵' });
  const pendingTrack = h('div', { class: 'ai-progress-track', role: 'progressbar', 'aria-label': 'پیشرفت تخمینی پردازش', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
  const pendingFill = h('span', { class: 'ai-progress-fill' });
  pendingTrack.append(pendingFill);
  const pending = h('li', { class: 'ai-msg ai-pending', role: 'status', 'aria-live': 'polite' }, [
    pendingTitle,
    h('div', { class: 'ai-progress-meta' }, [pendingElapsed, pendingRemaining]),
    pendingTrack,
  ]);
  pending.hidden = true;
  const ESTIMATED_TOTAL_MS = 65_000; // ۴۰ ثانیه برای مدل اصلی + حداکثر ۲۵ ثانیه برای fallback
  let progressStartedAt = 0;
  let progressTimer = null;
  function formatProgressTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    const mm = minutes.toLocaleString('fa-IR');
    const ss = String(remainder).padStart(2, '0').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    return `${mm}:${ss}`;
  }
  function updatePendingProgress() {
    const elapsed = Math.max(0, Date.now() - progressStartedAt);
    const remaining = Math.max(0, ESTIMATED_TOTAL_MS - elapsed);
    pendingElapsed.textContent = `زمان سپری‌شده: ${formatProgressTime(elapsed)}`;
    pendingRemaining.textContent = elapsed < ESTIMATED_TOTAL_MS
      ? `زمان تخمینی باقی‌مانده: ${formatProgressTime(remaining)}`
      : 'زمان معمول گذشته؛ هنوز منتظر پاسخ سرور هستیم.';
    pendingTitle.textContent = elapsed < 40_000
      ? 'در حال آماده‌سازی پاسخ حقوقی…'
      : elapsed < ESTIMATED_TOTAL_MS
        ? 'در حال تکمیل پاسخ…'
        : 'پردازش بیشتر از برآورد زمان برده است.';
    const percent = Math.min(95, Math.floor((elapsed / ESTIMATED_TOTAL_MS) * 95));
    pendingFill.style.width = `${percent}%`;
    pendingTrack.setAttribute('aria-valuenow', String(percent));
  }
  function startPendingProgress() {
    if (progressTimer) clearInterval(progressTimer);
    progressStartedAt = Date.now();
    updatePendingProgress();
    progressTimer = setInterval(updatePendingProgress, 1000);
  }
  function stopPendingProgress() {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
  }
  const log = h('ol', { class: 'ai-log', 'aria-label': 'گفت‌وگو' });
  const stream = h('div', { class: 'ai-stream', tabindex: '-1' }, [emptyState, log]);

  function aiMessageNode(m) {
    const outputs = Array.isArray(m.outputs) ? m.outputs.filter((item) => item && typeof item.text === 'string' && item.text.trim()) : [];
    const outputTexts = outputs.map((item) => ({ ...item, text: cleanModelOutput(item.text) }));
    const combined = outputTexts.map((item) => `${item.provider} · ${item.model} (${item.role === 'generator' ? 'پاسخ‌ساز' : 'بازبین'})\n${item.text}`).join('\n\n' + '─'.repeat(36) + '\n\n');
    const actions = h('div', { class: 'ai-msg-actions' });
    const copy = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'کپی پاسخ اصلی' });
    copy.addEventListener('click', async () => {
      try { await copyAssistantText(m.text); status.textContent = 'پاسخ اصلی کپی شد.'; } catch { status.textContent = 'کپی انجام نشد؛ متن را دستی انتخاب کنید.'; }
    });
    const dl = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'دریافت فایل متنی' });
    dl.addEventListener('click', () => downloadText(m.text, 'پیش‌نویس-آکادمی.txt'));
    actions.append(copy, dl);
    if (outputTexts.length) {
      const copyAll = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'کپی همه خروجی‌ها' });
      copyAll.addEventListener('click', async () => {
        try { await copyAssistantText(combined); status.textContent = 'همه خروجی‌های مدل‌ها همراه نام و نقششان کپی شد.'; }
        catch { status.textContent = 'کپی انجام نشد؛ متن خروجی‌ها را دستی انتخاب کنید.'; }
      });
      actions.append(copyAll);
    }
    const children = [h('span', { class: 'ai-role', text: 'دستیار' })];
    if (outputTexts.length) {
      for (const item of outputTexts) {
        const roleLabel = item.role === 'generator' ? 'پاسخ‌ساز' : 'بازبین مستقل';
        children.push(h('section', { class: 'ai-model-output' }, [
          h('h3', { class: 'ai-model-output-title', text: `${item.provider} · ${item.model} · ${roleLabel}` }),
          h('div', { class: 'ai-text pre-wrap', text: item.text }),
        ]));
      }
    } else {
      children.push(h('div', { class: 'ai-text pre-wrap', text: m.text }));
    }
    if (m.notes?.length) children.push(h('ul', { class: 'ai-notes', 'aria-label': 'یادداشت‌های بررسی' }, m.notes.map((n) => h('li', { text: n }))));
    if (m.reviewDetails?.length) {
      children.push(h('details', { class: 'ai-review-details' }, [
        h('summary', { text: 'جزئیات بازبینی مستقل' }),
        h('ul', { class: 'ai-notes' }, m.reviewDetails.map((n) => h('li', { text: n }))),
      ]));
    }
    if (m.disclaimer) children.push(h('p', { class: 'ai-disclaimer muted', text: m.disclaimer }));
    if (m.text) children.push(actions);
    return h('li', { class: 'ai-msg ai-msg-ai' }, children);
  }

  function renderLog() {
    log.replaceChildren(...history.map((m) => (m.role === 'ai'
      ? aiMessageNode(m)
      : h('li', { class: 'ai-msg ai-msg-user' }, [h('span', { class: 'ai-role', text: 'شما' }), h('div', { class: 'ai-text pre-wrap', text: m.text })]))));
    emptyState.hidden = history.length > 0;
    stream.scrollTop = stream.scrollHeight;
  }

  // ---------- کادر ارسال ----------
  const composerText = h('textarea', { class: 'ai-input', rows: '3', maxlength: String(MESSAGE_LIMIT), 'aria-label': 'پیام یا شرح پرونده', placeholder: 'موضوع دعوا، سمت موکل، مرجع رسیدگی، مرحله، خواسته، وقایع و دلایل موجود…' });
  const counter = h('span', { class: 'muted ai-counter', 'aria-live': 'polite', text: `0 / ${MESSAGE_LIMIT}` });
  composerText.addEventListener('input', () => { counter.textContent = `${composerText.value.length} / ${MESSAGE_LIMIT}`; });
  const fileInput = h('input', { type: 'file', accept: ATTACH_ACCEPT, multiple: '', hidden: '', 'aria-hidden': 'true', tabindex: '-1' });
  const attachBtn = h('button', { class: 'btn secondary', type: 'button', text: 'پیوست فایل' });
  attachBtn.setAttribute('aria-label', 'پیوست فایل: PDF، Word، تصویر یا متن');
  attachBtn.addEventListener('click', () => fileInput.click());
  const attachChip = h('div', { class: 'ai-attachment', hidden: '' });
  function renderAttachments() {
    attachChip.hidden = attachments.length === 0;
    attachChip.replaceChildren(
      ...attachments.map((a, i) => {
        const x = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'حذف' });
        x.setAttribute('aria-label', `حذف پیوست ${a.file.name}`);
        x.addEventListener('click', () => { attachments.splice(i, 1); renderAttachments(); });
        return h('div', { class: 'ai-attachment-item' }, [
          h('span', { class: 'ai-attachment-name', text: a.file.name }),
          h('span', { class: 'muted', text: `${a.label} · ${formatSize(a.file.size)}` }),
          x,
        ]);
      }),
      ...(attachments.length ? [h('p', { class: 'muted ai-privacy', text: ATTACH_PRIVACY_NOTE })] : []),
    );
  }
  fileInput.addEventListener('change', () => {
    const picked = Array.from(fileInput.files || []);
    fileInput.value = '';
    const problems = [];
    for (const file of picked) {
      const check = checkNewFile(file, attachments);
      if (check.ok) attachments.push({ file, label: check.label });
      else problems.push(`${file.name}: ${errorText(check.code)}`);
    }
    renderAttachments();
    status.textContent = problems.length ? problems.join(' ') : (picked.length ? 'پیوست شد. با ارسال، فایل برای بررسی همراه پیام فرستاده می‌شود.' : '');
  });

  const sendBtn = h('button', { class: 'btn ai-send', type: 'button', text: 'ارسال' });
  const newBtn = h('button', { class: 'btn secondary', type: 'button', text: 'گفت‌وگوی تازه' });
  const status = h('p', { class: 'muted ai-status', role: 'status', 'aria-live': 'polite' });

  async function send() {
    if (busy) return;
    const rawTyped = composerText.value.trim();
    const contractLabel = CONTRACT_TYPES.find(([value]) => value === contractSelect.value)?.[1];
    const typed = mode !== 'consult' && docSelect.value === 'contract' && contractLabel
      ? `نوع قرارداد درخواستی: ${contractLabel}\n\nشرح و شرایط موردنظر کاربر:\n${rawTyped}`
      : rawTyped;
    if (mode !== 'consult' && docSelect.value === 'contract' && !contractLabel) {
      status.textContent = 'ابتدا نوع قرارداد را از فهرست انتخاب کنید.';
      contractSelect.focus();
      return;
    }
    if (!typed && !attachments.length) { status.textContent = 'ابتدا شرح پرونده یا متن را بنویسید یا فایلی پیوست کنید.'; return; }
    if (typed.length > MESSAGE_LIMIT) {
      status.textContent = `متن بیش از ${MESSAGE_LIMIT.toLocaleString('fa-IR')} نویسه است. آن را کوتاه‌تر کنید یا بخش بلند را به‌صورت فایل پیوست کنید.`;
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    pending.hidden = false;
    startPendingProgress();
    log.append(pending);
    emptyState.hidden = true;
    stream.scrollTop = stream.scrollHeight;
    status.textContent = '';
    const sent = attachments.slice();
    let res;
    if (sent.length) {
      const form = new FormData();
      form.append('mode', mode);
      form.append('docType', docSelect.value);
      form.append('message', typed);
      form.append('history', JSON.stringify(trimHistory(history)));
      for (const a of sent) form.append('files', a.file, a.file.name);
      res = await postForm('/api/ai/assistant', form, { timeoutMs: 100000 });
    } else {
      res = await postJson('/api/ai/assistant', { mode, docType: docSelect.value, message: typed, history: trimHistory(history) }, { timeoutMs: 100000 });
    }
    stopPendingProgress();
    busy = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    pending.hidden = true;
    pending.remove();
    if (!res.ok || !res.data?.ok) {
      const code = res.data?.error || (res.timeoutError ? 'AI_REQUEST_TIMEOUT' : res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE');
      const which = res.data?.file ? ` (فایل: ${res.data.file})` : '';
      status.textContent = `${errorText(code)}${which} (کد: ${code}${res.data?.providerStatus ? ` · HTTP ${res.data.providerStatus}` : ''}${res.data?.providerReason ? ` ${res.data.providerReason}` : ''}${res.data?.reason ? ` · ${res.data.reason}` : ''} متن و پیوست‌های شما حفظ شد.`;
      renderLog();
      return;
    }
    // فقط نام فایل‌ها در گفت‌وگو و تاریخچه می‌ماند؛ محتوای فایل هرگز ذخیره نمی‌شود.
    const names = sent.map((a) => a.file.name);
    const userText = [typed, names.length ? `[پیوست: ${names.join('، ')}]` : ''].filter(Boolean).join('\n');
    history.push({ role: 'user', text: userText });
    const reply = summarizeReply(res.data);
    history.push({ role: 'ai', text: reply, outputs: res.data.outputs || [], notes: res.data.notes || [], reviewDetails: res.data.reviewDetails || [], disclaimer: res.data.status === 'ready' ? res.data.disclaimer : '' });
    composerText.value = '';
    counter.textContent = `0 / ${MESSAGE_LIMIT}`;
    attachments = [];
    renderAttachments();
    renderLog();
    const saved = await persistTurn(userText, reply).catch(() => false);
    status.textContent = saved
      ? (res.data.status === 'ready' ? 'پیش‌نویس آماده است. آن را بررسی کنید؛ پیش از استفاده باید وکیل تطبیق دهد.' : 'برای تکمیل، پاسخ پرسش‌های دستیار را بنویسید.')
      : 'پاسخ نمایش داده شد، اما ذخیرهٔ آن در تاریخچه انجام نشد.';
  }

  function newConversation() {
    threadId = null;
    history.length = 0;
    composerText.value = '';
    counter.textContent = `0 / ${MESSAGE_LIMIT}`;
    attachments = [];
    renderAttachments();
    renderLog();
    status.textContent = '';
    composerText.focus();
  }

  sendBtn.addEventListener('click', send);
  newBtn.addEventListener('click', newConversation);
  composerText.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });

  renderLog();
  if (initialThread && /^[1-9][0-9]{0,15}$/.test(initialThread)) loadThread(initialThread);

  const toolbar = h('div', { class: 'ai-toolbar' }, [modeGroup, docWrap, contractWrap, newBtn]);
  const composer = h('form', { class: 'ai-composer', 'aria-label': 'ارسال پیام' }, [
    attachChip,
    composerText,
    h('div', { class: 'ai-composer-bar' }, [attachBtn, fileInput, counter, sendBtn]),
    status,
    h('p', { class: 'ai-history-link' }, [h('a', { href: '#/assistant/history', text: 'سوابق گفت‌وگوها ←' })]),
  ]);
  composer.addEventListener('submit', (e) => { e.preventDefault(); send(); });

  syncMode();
  return h('div', { class: 'ai-shell' }, [
    h('section', { class: 'ai-main', 'aria-label': 'گفت‌وگو با دستیار' }, [toolbar, stream, composer]),
  ]);
}

/** صفحهٔ سوابق گفت‌وگوهای دستیار: فهرست، بازکردن و حذف. */
export function assistantHistoryPage() {
  const list = h('ul', { class: 'ai-thread-list ai-history-list', 'aria-label': 'سوابق گفت‌وگوها' });
  const note = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite', text: 'در حال بارگذاری…' });
  const wrap = h('div', { class: 'assistant' }, [
    h('span', { class: 'section-kicker', text: 'دستیار هوشمند وکیل' }),
    h('h1', { text: 'سوابق گفت‌وگوها' }),
    h('p', {}, [h('a', { class: 'btn', href: '#/assistant', text: 'پرسش یا گفت‌وگوی تازه' })]),
    note,
    list,
  ]);

  async function load() {
    const me = await getJson('/api/me');
    if (!me.ok) {
      note.replaceChildren(h('a', { href: '#/account', text: 'برای دیدن سوابق ابتدا وارد حساب خود شوید.' }));
      return;
    }
    const res = await getJson('/api/ai/threads');
    if (!res.ok) { note.textContent = 'فهرست گفت‌وگوها در دسترس نیست.'; return; }
    const rows = res.data?.threads || [];
    note.textContent = rows.length ? '' : 'هنوز گفت‌وگویی ذخیره نشده است.';
    list.replaceChildren(...rows.map((t) => {
      const when = formatShamsi(t.updated_at || t.created_at);
      const open = h('a', { class: 'ai-thread-open', href: `#/assistant?thread=${encodeURIComponent(t.id)}` }, [
        h('span', { text: t.title || 'گفت‌وگو' }),
        when ? h('small', { class: 'muted', text: when }) : null,
      ].filter(Boolean));
      const del = h('button', { class: 'ai-thread-del', type: 'button', text: 'حذف', 'aria-label': `حذف گفت‌وگوی ${t.title || ''}` });
      del.addEventListener('click', async () => {
        if (!window.confirm('این گفت‌وگو حذف شود؟')) return;
        const r = await sendJson('DELETE', `/api/ai/threads/${encodeURIComponent(t.id)}`, null);
        if (!r.ok) { note.textContent = 'حذف گفت‌وگو انجام نشد.'; return; }
        load();
      });
      return h('li', { class: 'ai-thread-item' }, [open, del]);
    }));
  }
  load();
  return wrap;
}
