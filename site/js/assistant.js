// دستیار هوشمند وکیل: گفت‌وگوی حرفه‌ای با تاریخچه، کادر ارسال ثابت و بارگذاری متن سند.
// فقط برای کاربر واردشده و وقتی سرویس روی سرور فعال است. هر دکمه‌ای که نشان داده می‌شود عملکرد واقعی دارد.
import { h } from './dom.js';
import { icon } from './icons.js';
import { getJson, postJson, postForm, sendJson } from './api.js';
import { aiStatus, errorText, blobToBase64, pickRecordingMime, baseMime } from './ai-client.js';
import { formatShamsi } from './shamsi.js';
import { VOICE_GREETING_TEXT, VOICE_GREETING_AUDIO_SRC } from './voice-greeting.js';

export const DOC_TYPES = [
  ['petition', 'پیش‌نویس دادخواست'], ['defense', 'پیش‌نویس لایحه دفاعیه'], ['appeal', 'لایحه تجدیدنظرخواهی'],
  ['cassation', 'لایحه فرجام‌خواهی'], ['enforcement', 'درخواست و لایحهٔ اجرایی'], ['notice', 'اظهارنامه'],
  ['criminal_complaint', 'شکواییه و دفاعیات کیفری'], ['reply', 'پاسخ به دادخواست یا لایحهٔ طرف مقابل'],
  ['retrial', 'دادخواست یا لایحه اعاده دادرسی'], ['third_party', 'دادخواست یا لایحه اعتراض ثالث'],
  ['opposition', 'دادخواست یا لایحه واخواهی'], ['counterclaim', 'دادخواست دعوای متقابل'],
  ['execution_objection', 'اعتراض به عملیات اجرایی یا اجرائیه'], ['jurisdiction', 'ایراد صلاحیت و درخواست ارسال پرونده'],
  ['evidence_request', 'درخواست تأمین دلیل یا ارائه و مطالبه دلیل'],
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
export const MODES = [['consult', 'مشاوره حقوقی'], ['analyze', 'تحلیل حقوقی پرونده'], ['litigation', 'میز محاکمه هوشمند'], ['research', 'تحقیق و راستی‌آزمایی حقوقی'], ['review', 'بررسی و اصلاح متن']];

export const ASSISTANT_NOTICE = 'این ابزار آموزشی و پیش‌نویس‌ساز است. خروجی آن پیش از استفاده در پرونده واقعی باید توسط وکیل با قوانین و مقررات جاری و رویه معتبر تطبیق داده شود. اطلاعات و پیوست‌های انتخاب‌شده برای تولید پاسخ به سرویس هوش مصنوعی ارسال می‌شوند؛ پیش از ارسال، اطلاعات محرمانه و هویتی غیرضروری را حذف یا ناشناس کنید.';

const MESSAGE_LIMIT = 6000;

/** پاک‌سازی نشانه‌های Markdown و تبدیل ساختار JSON بازبین به متن خوانا. */
function cleanModelOutput(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n')
    .replace(/^\x60{3}(?:[a-z0-9_-]+)?\s*/gim, '').replace(/^\x60{3}\s*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[─━═_*—]{3,}\s*$/gm, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1').replace(/__(.*?)__/gs, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
export function reviewUnavailableMessage(status, notes = []) {
  const note = Array.isArray(notes) ? notes.find((item) => typeof item === 'string' && /بازبینی مستقل/u.test(item)) : '';
  if (note) return note;
  const messages = {
    skipped_attachments: 'به‌دلیل وجود پیوست، برای رعایت محرمانگی محتوای پرونده به بازبین مستقل دیگری ارسال نشد.',
    skipped_fallback: 'در این نوبت، پاسخ از مسیر جایگزین تولید شد و بازبینی مستقل جداگانه اجرا نشد.',
    not_configured: 'سرویس بازبینی مستقل در دسترس نیست.',
    timeout: 'بازبین مستقل در زمان مقرر پاسخ نداد؛ گزارشی تولید نشد.',
    quota_exceeded: 'سهمیه سرویس بازبینی مستقل در دسترس نبود؛ گزارشی تولید نشد.',
    provider_error: 'سرویس بازبینی مستقل موقتاً پاسخ‌گو نبود.',
    invalid_response: 'پاسخ بازبین مستقل قابل پردازش نبود.',
    network_error: 'ارتباط با بازبین مستقل برقرار نشد.',
    not_run: 'بازبینی مستقل برای این پاسخ اجرا نشد.',
  };
  return messages[status] || 'گزارش بازبینی مستقل برای این پاسخ دریافت نشد؛ این وضعیت به‌معنای تأیید صحت پاسخ نیست.';
}

export function formatReviewerOutput(value) {
  let data;
  try { data = JSON.parse(value); } catch { return cleanModelOutput(value); }
  if (!data || typeof data !== 'object' || !('risk' in data)) return cleanModelOutput(value);
  const risk = data.risk === 'high' ? 'زیاد' : data.risk === 'medium' ? 'متوسط' : 'کم';
  const lines = [`ارزیابی کلی: ریسک ${risk}`];
  if (data.summary) lines.push(`خلاصه: ${cleanModelOutput(data.summary)}`);
  if (Array.isArray(data.issues) && data.issues.length) {
    lines.push('', 'موارد قابل توجه:');
    data.issues.forEach((item, index) => {
      const severity = item.severity === 'high' ? 'زیاد' : item.severity === 'low' ? 'کم' : 'متوسط';
      lines.push(`${index + 1}) [اهمیت ${severity}] ${cleanModelOutput(item.category || 'نکته')}`);
      if (item.observation) lines.push(`مشاهده: ${cleanModelOutput(item.observation)}`);
      if (item.recommendation) lines.push(`پیشنهاد: ${cleanModelOutput(item.recommendation)}`);
    });
  }
  if (Array.isArray(data.citations) && data.citations.length) {
    lines.push('', 'استنادهای نیازمند توجه:');
    data.citations.forEach((item, index) => {
      lines.push(`${index + 1}) ${cleanModelOutput(item.citation || '')}`);
      if (item.concern) lines.push(`توضیح: ${cleanModelOutput(item.concern)}`);
    });
  }
  return lines.join('\n').trim();
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
  ['litigation', 'retrial', 'این پرونده را تحلیل کن و هم‌زمان گزارش مستقلی از صحت، ارتباط و کفایت استنادات قانونی ارائه بده.'],
  ['research', 'other', 'درباره این مسئله تحقیق حقوقی انجام بده و برای هر ماده قانونی توضیح بده دقیقاً کدام گزاره را پشتیبانی می‌کند؛ موارد تأییدنشده را جدا کن.'],
  ['litigation', 'third_party', 'شرایط و جهات اعتراض ثالث را با توجه به رأی و اسناد پیوست بررسی کن.'],
  ['litigation', 'retrial', 'بررسی کن آیا وقایع و مدارک این پرونده با یکی از جهات قانونی اعاده دادرسی منطبق است یا خیر.'],
];

/** پیام‌های کاربر و پاسخ دستیار برای ارسال دوباره به سرور؛ سقف ۴۰ پیام مطابق محدودیت سرور. */
export function trimHistory(history) {
  // سقف با محدودیت سمت سرور هماهنگ است تا گفت‌وگوی طولانی مشاوره در زمان تنظیم سند حذف نشود.
  return history.slice(-40).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, 4000) }));
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
    const initialMode = MODES.some(([value]) => value === params.mode) ? params.mode : 'consult';
    const chooserTitle = initialMode === 'litigation' ? 'میز محاکمه هوشمند' : initialMode === 'research' ? 'تحقیق و راستی‌آزمایی حقوقی' : 'مشاوره حقوقی هوشمند';
    body.replaceChildren(methodChooser((method) => body.replaceChildren(assistantWorkspace(guestMode ? null : params.thread, guestMode, method, initialMode)), chooserTitle));
  })().catch((error) => {
    console.error('assistant.access_check_failed', error);
    body.replaceChildren(h('div', { class: 'notice', role: 'alert' }, [
      h('p', { text: 'بررسی دسترسی به دستیار کامل نشد. اتصال یا وضعیت ورود را بررسی کنید و دوباره تلاش کنید.' }),
      h('p', {}, [h('a', { href: '#/assistant', text: 'تلاش دوباره' })]),
    ]));
  });
  return wrap;
}

/** انتخاب روش پاسخ‌گویی: متنی، یا هوشمند (چت و گفت‌وگوی صوتی در یک محیط). */
function methodChooser(onPick, title = 'مشاوره حقوقی هوشمند') {
  const description = title === 'مشاوره حقوقی هوشمند'
    ? 'روش پاسخ‌گویی را انتخاب کنید. هر دو از همان مشاوره، حافظهٔ گفت‌وگو و بازبینی پشت‌صحنه استفاده می‌کنند.'
    : `روش پاسخ‌گویی را برای بخش «${title}» انتخاب کنید؛ متن یا گفت‌وگوی صوتی در همین گردش‌کار در دسترس است.`;
  const card = (title, desc, method) => {
    const b = h('button', { class: 'assistant-document-card', type: 'button' }, [
      h('span', { class: 'assistant-document-copy' }, [h('strong', { text: title }), h('small', { text: desc })]),
    ]);
    b.addEventListener('click', () => onPick(method));
    return b;
  };
  return h('section', { class: 'ai-method-chooser', 'aria-label': 'روش پاسخ‌گویی' }, [
    h('h1', { text: title }),
    h('p', { class: 'muted', text: description }),
    h('div', { class: 'assistant-document-grid' }, [
      card('پاسخ‌گویی متنی', 'پرسش یا شرح پرونده را تایپ کنید و گفت‌وگو را ادامه دهید.', 'text'),
      card('پاسخ‌گویی هوشمند', 'چت متنی و گفت‌وگوی صوتی؛ بین آن‌ها جابه‌جا شوید بدون از دست رفتن گفت‌وگو.', 'smart'),
    ]),
  ]);
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

function assistantWorkspace(initialThread, guestMode = false, method = 'smart', initialMode = 'consult') {
  const voiceAllowed = method === 'smart';
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
    acceptBtn.hidden = true;
    status.textContent = 'گفت‌وگو بازیابی شد. برای تأیید نتیجه، ابتدا از دستیار بخواهید جمع‌بندی نهایی مشاوره را ارائه کند.';
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
  let mode = MODES.some(([value]) => value === initialMode) ? initialMode : 'consult';
  const workspaceIntro = h('section', { class: 'ai-workbench-intro', role: 'region', 'aria-label': 'راهنمای بخش' }, [
    h('h1', { text: 'مشاوره حقوقی هوشمند' }),
    h('p', { class: 'muted', text: 'گفت‌وگوی تعاملی برای روشن‌کردن مسئله، تکمیل واقعیت‌های مؤثر و رسیدن به راهکار حقوقی.' }),
  ]);
  function syncWorkspaceIntro() {
    const copy = {
      consult: ['مشاوره حقوقی هوشمند', 'گفت‌وگوی تعاملی برای روشن‌کردن مسئله، تکمیل واقعیت‌های مؤثر و رسیدن به راهکار حقوقی.'],
      litigation: ['میز محاکمه هوشمند', 'در کنار پاسخ مشاوره، استنادات، مبانی قانونی، خلأهای مستند و نقاط آسیب‌پذیر تحلیل را مستقلاً راستی‌آزمایی می‌کند. گزارش این بازبینی همراه همان پاسخ ارائه می‌شود.'],
      research: ['تحقیق و راستی‌آزمایی حقوقی', 'تمرکز بر شناسایی منابع، متن مقررات، اعتبار زمانی و انطباق هر استناد با گزاره حقوقی مورد ادعا.'],
      analyze: ['تحلیل حقوقی پرونده', 'استخراج وقایع، خواسته‌ها، ادله، مسائل حقوقی و خطرهای اصلی پرونده.'],
      review: ['بررسی و اصلاح متن حقوقی', 'بازبینی ساختار، نگارش، استدلال، ابهام‌ها و تعارض‌های متن ارائه‌شده.'],
      draft: ['تنظیم اسناد حقوقی', 'تنظیم پیش‌نویس بر پایه اطلاعات و نتیجه مشاوره تأییدشده.'],
    };
    const selected = copy[mode] || copy.consult;
    workspaceIntro.firstElementChild.textContent = selected[0];
    workspaceIntro.lastElementChild.textContent = selected[1];
  }
  const modeGroup = h('div', { class: 'ai-seg', role: 'group', 'aria-label': 'نوع کار' });
  const modeIcons = { consult: 'scale', draft: 'edit', analyze: 'search', litigation: 'gavel', research: 'book-open-check', review: 'clipboard-list' };
  const modeButtons = MODES.map(([value, label]) => {
    const b = h('button', { class: 'ai-seg-btn', type: 'button', 'aria-label': label }, [
      h('span', { class: 'ai-mode-icon', 'aria-hidden': 'true' }, [icon(modeIcons[value], { size: 19 })]),
      h('span', { class: 'ai-mode-label', text: label }),
    ]);
    b.setAttribute('aria-pressed', value === mode ? 'true' : 'false');
    b.addEventListener('click', () => {
      mode = value;
      if (value === 'consult') { acceptedConclusion = ''; partyPanel.hidden = true; acceptBtn.hidden = true; }
      else { acceptBtn.hidden = true; }
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
  modeGroup.append(...modeButtons);
  const docSelect = h('select', { 'aria-label': 'نوع سند' }, DOC_TYPES.map(([v, t]) => h('option', { value: v, text: t })));
  if (initialMode === 'litigation') docSelect.value = 'retrial';
  else if (initialMode === 'research') docSelect.value = 'other';
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
    syncPartyLabels();
  });
  function syncContractModeButton() {
    contractModeButton.setAttribute('aria-pressed', mode !== 'consult' && docSelect.value === 'contract' ? 'true' : 'false');
  }
  function syncContractPicker() {
    contractWrap.hidden = mode === 'consult' || docSelect.value !== 'contract';
    syncContractModeButton();
  }
  const PLACEHOLDERS = {
    consult: 'پرسش حقوقی یا قضایی خود را بنویسید؛ گفت‌وگو تا رسیدن به نتیجه روشن ادامه پیدا می‌کند…',
    other: 'در صورت نیاز، توضیح تکمیلی یا متن مورد بررسی را وارد کنید…',
  };
  function syncMode() {
    modeButtons.forEach((x, i) => x.setAttribute('aria-pressed', MODES[i][0] === mode && docSelect.value !== 'contract' ? 'true' : 'false'));
    docWrap.hidden = mode === 'consult';
    // در مشاوره فقط «مشاوره» دیده می‌شود؛ سایر حالت‌ها بعد از توافق بر نتیجه باز می‌شوند.
    modeButtons.forEach((x, i) => { x.hidden = MODES[i][0] !== 'consult' && mode === 'consult' && !acceptedConclusion; });
    contractModeButton.hidden = mode === 'consult' && !acceptedConclusion;
    composerText.placeholder = mode === 'consult'
      ? (voiceAllowed ? 'پیام خود را برای دستیار بنویسید…' : PLACEHOLDERS.consult)
      : mode === 'litigation'
        ? 'شرح پرونده، خواسته، موضع خود و اسناد یا دفاع طرف مقابل را وارد کنید…'
        : mode === 'research'
          ? 'پرسش حقوقی یا استناد مورد بررسی را دقیق بنویسید…'
          : PLACEHOLDERS.other;
    syncWorkspaceIntro();
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
  const emptyState = h('div', { class: 'ai-empty', hidden: voiceAllowed }, [
    h('p', { class: 'muted', text: 'پرسش یا شرح پرونده را بنویسید؛ اگر منبع معتبری نباشد، پاسخ صریحاً همین را می‌گوید.' }),
    suggestionsBox,
  ]);
  // در حالت هوشمند، چت از ابتدا مانند گفت‌وگوی پشتیبانی آغاز می‌شود؛ نه با فرم خالی.
  if (voiceAllowed) history.push({ role: 'ai', text: 'سلام، خوش آمدید. من دستیار هوشمند آکادمی وکالت هستم. لطفاً موضوع یا مسئله‌ای را که می‌خواهید بررسی کنیم، به زبان خودتان توضیح دهید. اگر برای فهم دقیق‌تر موضوع به اطلاعات بیشتری نیاز داشته باشم، در همین گفت‌وگو از شما می‌پرسم.' });
  const pendingTitle = h('strong', { class: 'ai-pending-title', text: 'در حال آماده‌سازی پاسخ حقوقی…' });
  const pendingElapsed = h('span', { class: 'ai-progress-elapsed', text: 'زمان سپری‌شده: ۰:۰۰' });
  const pendingRemaining = h('span', { class: 'ai-progress-remaining', text: 'زمان تخمینی باقی‌مانده: ۱:۳۰' });
  const pendingTrack = h('div', { class: 'ai-progress-ring', role: 'progressbar', 'aria-label': 'درصد زمان سپری‌شده از برآورد پردازش', 'aria-valuemin': '0', 'aria-valuemax': '95', 'aria-valuenow': '0' });
  const pendingPercent = h('span', { class: 'ai-progress-percent', text: '۰٪' });
  pendingTrack.append(pendingPercent);
  const pending = h('div', { class: 'ai-pending', role: 'status', 'aria-live': 'polite' }, [
    pendingTitle,
    h('div', { class: 'ai-progress-layout' }, [
      pendingTrack,
      h('div', { class: 'ai-progress-meta' }, [pendingElapsed, pendingRemaining]),
    ]),
  ]);
  pending.hidden = true;
  const ESTIMATED_TOTAL_MS = 90_000; // برآورد تقریبی تولید پاسخ به‌علاوه بازبینی مستقل
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
    pendingTrack.style.background = `conic-gradient(var(--teal) ${percent}%, #e8e2d5 ${percent}% 100%)`;
    pendingPercent.textContent = `${percent.toLocaleString('fa-IR')}٪`;
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
    const actions = h('div', { class: 'ai-msg-actions' });
    const copy = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'کپی پاسخ' });
    copy.addEventListener('click', async () => {
      try { await copyAssistantText(m.text); status.textContent = 'پاسخ دستیار کپی شد.'; }
      catch { status.textContent = 'کپی انجام نشد؛ متن را دستی انتخاب کنید.'; }
    });
    actions.append(copy);
    const reviewReport = m.reviewReport && typeof m.reviewReport === 'object' ? formatReviewerOutput(JSON.stringify(m.reviewReport)) : '';
    let reviewPanel = null;
    const hasReviewState = Boolean(m.reviewStatus || reviewReport);
    if (hasReviewState) {
      const reviewButton = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'دیدن گزارش بازبینی مستقل', 'aria-expanded': 'false' });
      reviewPanel = h('section', { class: 'ai-review-panel', hidden: '' }, [
        h('strong', { class: 'ai-review-panel-title', text: 'گزارش بازبینی مستقل و تطبیق استنادات' }),
        h('div', { class: 'ai-text pre-wrap', text: reviewReport || reviewUnavailableMessage(m.reviewStatus, m.notes) }),
      ]);
      reviewButton.addEventListener('click', () => {
        reviewPanel.hidden = !reviewPanel.hidden;
        reviewButton.setAttribute('aria-expanded', String(!reviewPanel.hidden));
        reviewButton.textContent = reviewPanel.hidden ? 'دیدن گزارش بازبینی مستقل' : 'بستن گزارش بازبینی';
      });
      actions.append(reviewButton);
    }
    const dl = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'دریافت فایل متنی' });
    dl.addEventListener('click', () => downloadText(m.text, 'پاسخ-دستیار-آکادمی.txt'));
    actions.append(dl);

    const children = [
      h('span', { class: 'ai-role', text: 'دستیار' }),
      h('div', { class: 'ai-text pre-wrap', text: m.text }),
    ];
    if (reviewPanel) children.push(reviewPanel);
    if (m.notes?.length) children.push(h('ul', {
      class: 'ai-notes',
      'aria-label': 'نکات تکمیلی',
    }, m.notes.map((note) => h('li', { text: note }))));
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
  const composerText = h('textarea', {
    class: voiceAllowed ? 'ai-input ai-chat-input' : 'ai-input',
    rows: voiceAllowed ? '1' : '3',
    maxlength: String(MESSAGE_LIMIT),
    'aria-label': voiceAllowed ? 'پیام به دستیار' : 'پیام یا شرح پرونده',
    placeholder: voiceAllowed ? 'پیام خود را برای دستیار بنویسید…' : 'موضوع دعوا، سمت موکل، مرجع رسیدگی، مرحله، خواسته، وقایع و دلایل موجود…',
  });
  const counter = h('span', { class: 'muted ai-counter', 'aria-live': 'polite', text: `0 / ${MESSAGE_LIMIT}` });
  const mediaRecorderAvailable = Boolean(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
  let voiceMode = false;
  let recording = false;
  let voiceProcessing = false;
  let speaking = false;
  let recorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let currentAudio = null;
  let currentAudioUrl = null;
  let recordTimeout = null;
  let audioContext = null;
  let waveformAnalyser = null;
  let waveformSource = null;
  let waveformFrame = null;
  const voiceBtn = h('button', { class: 'btn ai-voice-toggle', type: 'button', text: 'شروع گفت‌وگوی صوتی' });
  const voiceEndBtn = h('button', { class: 'btn secondary ai-voice-end', type: 'button', text: 'پایان گفت‌وگو', hidden: '' });
  const playReplyBtn = h('button', { class: 'btn secondary ai-voice-play', type: 'button', text: 'پخش دوباره پاسخ', hidden: '' });
  const voiceWave = h('div', { class: 'ai-voice-wave', 'data-state': mediaRecorderAvailable ? 'idle' : 'unsupported', role: 'img', 'aria-label': 'وضعیت گفت‌وگوی صوتی' },
    Array.from({ length: 9 }, () => h('span', { 'aria-hidden': 'true' }))
  );
  const waveformBars = Array.from(voiceWave.children);
  const voiceHint = h('span', { class: 'muted ai-voice-hint', role: 'status', 'aria-live': 'polite', text: mediaRecorderAvailable
    ? 'برای شروع گفت‌وگوی پیوسته، دکمه را بزنید و اجازه میکروفون را صادر کنید. پس از هر پاسخ، دستیار دوباره گوش می‌دهد؛ برای توقف، «پایان گفت‌وگو» را بزنید. صدای ضبط‌شده فقط برای تبدیل گفتار به متن به Gemini فرستاده می‌شود و در تاریخچه ذخیره نمی‌شود.'
    : 'ضبط صدا در این مرورگر پشتیبانی نمی‌شود؛ Safari یا Chrome را به‌روز کنید و مجوز میکروفون را بررسی کنید.' });
  const voicePanel = h('div', { class: 'ai-voice-panel', 'aria-label': 'کنترل گفت‌وگوی صوتی' }, [
    h('div', { class: 'ai-voice-actions' }, [voiceBtn, voiceEndBtn, playReplyBtn]),
    voiceWave,
    voiceHint,
  ]);
  function setVoiceState(state, message) {
    voiceWave.dataset.state = state;
    voiceWave.setAttribute('aria-label', message);
    voiceHint.textContent = message;
    voiceBtn.textContent = recording ? 'پایان صحبت و ارسال' : voiceMode ? 'شروع صحبت' : 'شروع گفت‌وگوی صوتی';
    voiceBtn.setAttribute('aria-pressed', recording ? 'true' : 'false');
    voiceBtn.disabled = !mediaRecorderAvailable || voiceProcessing || speaking || busy;
    voiceEndBtn.hidden = !voiceMode;
  }
  function stopWaveform() {
    if (waveformFrame !== null) cancelAnimationFrame(waveformFrame);
    waveformFrame = null;
    waveformSource?.disconnect();
    waveformSource = null;
    waveformAnalyser = null;
    voiceWave.dataset.live = 'false';
    waveformBars.forEach((bar) => { bar.style.transform = 'scaleY(.12)'; });
  }
  function drawWaveform() {
    if (!waveformAnalyser || !waveformBars.length) return;
    const values = new Uint8Array(waveformAnalyser.frequencyBinCount);
    waveformAnalyser.getByteFrequencyData(values);
    const step = Math.max(1, Math.floor(values.length / waveformBars.length));
    waveformBars.forEach((bar, index) => {
      let total = 0;
      const start = index * step;
      for (let j = start; j < Math.min(values.length, start + step); j++) total += values[j];
      const level = total / Math.max(1, Math.min(step, values.length - start)) / 255;
      const height = Math.max(.09, Math.min(1, .10 + level * 2.25));
      bar.style.transform = `scaleY(${height.toFixed(2)})`;
    });
    waveformFrame = requestAnimationFrame(drawWaveform);
  }
  async function connectWaveform(source, monitorOutput = false) {
    stopWaveform();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();
      waveformAnalyser = audioContext.createAnalyser();
      waveformAnalyser.fftSize = 128;
      waveformAnalyser.smoothingTimeConstant = .78;
      waveformSource = source;
      waveformSource.connect(waveformAnalyser);
      if (monitorOutput) waveformAnalyser.connect(audioContext.destination);
      voiceWave.dataset.live = 'true';
      drawWaveform();
    } catch (error) {
      console.info('assistant.waveform_unavailable', error?.name || 'Error');
      stopWaveform();
    }
  }
  async function connectMicrophoneWaveform() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    await connectWaveform(audioContext.createMediaStreamSource(mediaStream), false);
  }
  async function connectPlaybackWaveform(audioElement) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    await connectWaveform(audioContext.createMediaElementSource(audioElement), true);
  }
  function releaseMicrophone() {
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  function closeAudioContext() {
    stopWaveform();
    if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    audioContext = null;
  }
  function stopSpeaking() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
    speaking = false;
    playReplyBtn.hidden = true;
    stopWaveform();
  }
  function stopVoiceMode() {
    voiceMode = false;
    if (greetingAudio) { try { greetingAudio.pause(); } catch {} greetingAudio = null; }
    if (recordTimeout) clearTimeout(recordTimeout);
    recordTimeout = null;
    if (recorder && recording) {
      recording = false;
      try { recorder.stop(); } catch {}
    }
    recorder = null;
    audioChunks = [];
    releaseMicrophone();
    stopSpeaking();
    closeAudioContext();
    voiceProcessing = false;
    setVoiceState('idle', 'گفت‌وگوی صوتی متوقف شد.');
    voiceEndBtn.hidden = true;
  }
  async function startRecording() {
    if (!voiceMode || recording || voiceProcessing || speaking || busy || !mediaRecorderAvailable) return;
    setVoiceState('connecting', 'در حال اتصال به میکروفون…');
    try {
      if (!mediaStream || !mediaStream.getAudioTracks().some((track) => track.readyState === 'live')) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      if (!voiceMode) { releaseMicrophone(); return; }
      await connectMicrophoneWaveform();
      const preferredMime = pickRecordingMime();
      recorder = preferredMime
        ? new MediaRecorder(mediaStream, { mimeType: preferredMime, audioBitsPerSecond: 32000 })
        : new MediaRecorder(mediaStream);
      audioChunks = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) audioChunks.push(event.data);
      });
      recorder.addEventListener('error', () => {
        recording = false;
        releaseMicrophone();
        recorder = null;
        setVoiceState('error', 'ضبط صدا با خطا متوقف شد؛ دوباره تلاش کنید.');
      }, { once: true });
      recorder.addEventListener('stop', () => {
        const mime = recorder?.mimeType || audioChunks[0]?.type || '';
        const blob = new Blob(audioChunks, { type: mime });
        audioChunks = [];
        recorder = null;
        if (!voiceMode) return;
        if (!blob.size) {
          setVoiceState('error', 'صدایی ضبط نشد؛ دوباره صحبت کنید.');
          return;
        }
        transcribeVoice(blob).catch((error) => {
          console.error('assistant.voice_transcription_failed', error?.name || 'Error');
          voiceProcessing = false;
          setVoiceState('error', 'تبدیل صدا به متن انجام نشد؛ اتصال اینترنت و دسترسی میکروفون را بررسی و دوباره تلاش کنید.');
        });
      }, { once: true });
      recorder.start();
      recording = true;
      setVoiceState('listening', 'میکروفون فعال است؛ صحبت کنید. پس از پایان صحبت، دکمه «پایان صحبت و ارسال» را بزنید. موج صدا شدت واقعی صدای شما را نشان می‌دهد.');
      recordTimeout = window.setTimeout(() => {
        if (recording) stopRecording();
      }, 90000);
    } catch (error) {
      releaseMicrophone();
      recorder = null;
      const message = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        ? 'اجازه میکروفون صادر نشد؛ دسترسی میکروفون سایت را در تنظیمات Safari فعال کنید.'
        : error?.name === 'NotFoundError'
          ? 'میکروفونی در دستگاه پیدا نشد.'
          : 'شروع ضبط ممکن نشد؛ مجوز میکروفون و تنظیمات مرورگر را بررسی کنید.';
      setVoiceState('error', message);
    }
  }
  function stopRecording() {
    if (!recording || !recorder) return;
    recording = false;
    stopWaveform();
    if (recordTimeout) clearTimeout(recordTimeout);
    recordTimeout = null;
    voiceProcessing = true;
    setVoiceState('processing', 'ضبط پایان یافت؛ در حال تبدیل گفتار به متن…');
    try { recorder.stop(); } catch {
      voiceProcessing = false;
      releaseMicrophone();
      setVoiceState('error', 'پایان ضبط با خطا روبه‌رو شد؛ دوباره تلاش کنید.');
    }
  }
  async function transcribeVoice(blob) {
    const mimeType = baseMime(blob.type || 'audio/mp4');
    if (!['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'].includes(mimeType)) {
      voiceProcessing = false;
      setVoiceState('error', 'قالب ضبط صدا در این مرورگر پشتیبانی نمی‌شود؛ Safari را به‌روز کنید.');
      return;
    }
    const data = await blobToBase64(blob);
    const result = await postJson('/api/ai/transcribe', { mimeType, data, language: 'fa' }, { timeoutMs: 120000 });
    if (!result.ok || !result.data?.ok) {
      voiceProcessing = false;
      const code = result.data?.error || (result.timeoutError ? 'AI_REQUEST_TIMEOUT' : result.networkError ? 'NETWORK' : 'AI_UNAVAILABLE');
      setVoiceState('error', `تبدیل گفتار ناموفق بود: ${errorText(code)} (کد: ${code})`);
      return;
    }
    if (!voiceMode) { voiceProcessing = false; return; }
    const recognized = String(result.data.text || '').trim();
    if (!recognized) {
      voiceProcessing = false;
      setVoiceState('ready', 'گفتاری تشخیص داده نشد؛ دوباره صحبت کنید.');
      if (voiceMode) window.setTimeout(() => startRecording(), 350);
      return;
    }
    composerText.value = [composerText.value.trim(), recognized].filter(Boolean).join(' ').slice(0, MESSAGE_LIMIT);
    counter.textContent = `${composerText.value.length} / ${MESSAGE_LIMIT}`;
    setVoiceState('processing', 'متن گفتار دریافت شد؛ در حال ارسال برای مشاوره حقوقی…');
    await send();
  }
  const VOICE_GREETING = VOICE_GREETING_TEXT;
  // فایل خوشامدگویی یک‌بار در شروع صفحه بررسی می‌شود (HEAD)؛ اگر نبود یا نوع آن صوتی نبود، از صدای مرورگر استفاده می‌شود.
  let greetingFileOk = false;
  let greetingAudio = null;
  fetch(VOICE_GREETING_AUDIO_SRC, { method: 'HEAD', cache: 'no-store' })
    .then((r) => { greetingFileOk = r.ok && (r.headers.get('content-type') || '').startsWith('audio/'); })
    .catch(() => { greetingFileOk = false; });

  // پخش فایل ذخیره‌شده، همزمان با کلیک کاربر (بدون فراخوانی Gemini). پس از پایان، ضبط آماده می‌شود.
  function playGreetingFile() {
    speaking = true;
    const audio = new Audio(VOICE_GREETING_AUDIO_SRC);
    audio.setAttribute('playsinline', '');
    audio.preload = 'auto';
    greetingAudio = audio;
    const finish = (message, startNext) => {
      speaking = false;
      greetingAudio = null;
      setVoiceState('ready', message);
      if (startNext && voiceMode) window.setTimeout(() => startRecording(), 300);
    };
    audio.addEventListener('ended', () => finish('خوشامدگویی تمام شد؛ حالا سؤال یا شرح پرونده‌تون رو بگید.', true));
    audio.addEventListener('error', () => finish('فایل خوشامدگویی پخش نشد؛ متن آن بالا نوشته شده است. «شروع صحبت» را بزنید.', false));
    audio.play().catch(() => finish('پخش خودکار مرورگر مسدود شد؛ متن را بخوانید و «شروع صحبت» را بزنید.', false));
    setVoiceState('speaking', VOICE_GREETING);
  }

  function speakGreeting() {
    if (!voiceMode) return;
    if (greetingFileOk) { playGreetingFile(); return; }
    // تا زمان نصب فایل خوشامدگویی باکیفیت، صدای فارسی نامطمئن سیستم را پخش نکن.
    speaking = false;
    setVoiceState('ready', 'خوشامدگویی صوتی باکیفیت هنوز نصب نشده است؛ متن خوشامدگویی را بخوانید. دستیار آماده شنیدن است.');
    startRecording();
  }

  function speakGreetingWithSpeechSynthesis() {
    if (!voiceMode) return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') {
      setVoiceState('ready', VOICE_GREETING);
      startRecording();
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(VOICE_GREETING);
      utterance.lang = 'fa-IR';
      utterance.rate = 0.96;
      const persianVoice = window.speechSynthesis.getVoices().find((voice) => /^fa([_-]|$)/i.test(voice.lang));
      if (persianVoice) utterance.voice = persianVoice;
      utterance.onend = () => {
        speaking = false;
        setVoiceState('ready', 'خوشامدگویی تمام شد؛ حالا سؤال یا شرح پرونده‌تون رو بگید.');
        if (voiceMode) window.setTimeout(() => startRecording(), 300);
      };
      utterance.onerror = () => {
        speaking = false;
        setVoiceState('ready', 'پخش خوشامدگویی ممکن نشد؛ می‌توانید گفت‌وگو را ادامه دهید.');
        if (voiceMode) window.setTimeout(() => startRecording(), 500);
      };
      speaking = true;
      setVoiceState('speaking', 'در حال خوشامدگویی صوتی…');
      // این فراخوانی عمداً هم‌زمان با کلیک کاربر است تا Safari اجازه پخش بدهد.
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      speaking = false;
      setVoiceState('ready', 'پخش خوشامدگویی ممکن نشد؛ گفت‌وگو را ادامه دهید.');
      if (voiceMode) window.setTimeout(() => startRecording(), 500);
    }
  }

  async function speakReply(text) {
    if (!voiceMode || !text) return;
    const spokenText = String(text).replace(/\[جای خالی:[^\]]*\]/g, 'جای خالی').slice(0, 2000);
    speaking = true;
    setVoiceState('speaking', 'پاسخ دستیار در حال آماده‌سازی و پخش است…');
    try {
      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
        body: JSON.stringify({ text: spokenText, voice: 'Kore' }),
        // اگر سرویس گفتار کند باشد، سریع به صدای داخلی مرورگر برمی‌گردیم.
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        let code = 'AI_UNAVAILABLE';
        try { code = (await response.json())?.error || code; } catch {}
        throw new Error(code);
      }
      const audioBlob = await response.blob();
      if (!voiceMode) { speaking = false; return; }
      if (!audioBlob.size) throw new Error('EMPTY_AUDIO');
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = URL.createObjectURL(audioBlob);
      currentAudio = new Audio(currentAudioUrl);
      currentAudio.onended = () => {
        speaking = false;
        currentAudio = null;
        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
        stopWaveform();
        setVoiceState('ready', 'پاسخ تمام شد؛ دوباره گوش می‌دهم. برای پایان، «پایان گفت‌وگو» را بزنید.');
        if (voiceMode) window.setTimeout(() => startRecording(), 350);
      };
      currentAudio.onerror = () => {
        speaking = false;
        playReplyBtn.hidden = false;
        setVoiceState('ready', 'پخش خودکار ممکن نشد؛ برای شنیدن پاسخ، «پخش دوباره پاسخ» را بزنید.');
        if (voiceMode) window.setTimeout(() => startRecording(), 500);
      };
      try {
        await connectPlaybackWaveform(currentAudio);
        await currentAudio.play();
        playReplyBtn.hidden = true;
      } catch (playError) {
        speaking = false;
        playReplyBtn.hidden = false;
        setVoiceState('ready', 'پاسخ صوتی آماده است؛ برای پخش روی «پخش دوباره پاسخ» بزنید.');
        console.info('assistant.voice_autoplay_blocked', playError?.name || 'Error');
        return;
      }
    } catch (error) {
      speaking = false;
      console.warn('assistant.voice_playback_unavailable', error?.message || error?.name || 'Error');
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
      currentAudio = null;
      if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function' && voiceMode) {
        try {
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.lang = 'fa-IR';
          utterance.onend = () => {
            speaking = false;
            setVoiceState('ready', 'پاسخ تمام شد؛ دوباره گوش می‌دهم. برای پایان، «پایان گفت‌وگو» را بزنید.');
            if (voiceMode) window.setTimeout(() => startRecording(), 350);
          };
          utterance.onerror = () => {
            speaking = false;
            setVoiceState('ready', 'پاسخ به‌صورت نوشتاری آماده است؛ برای ادامه گفت‌وگو «شروع صحبت» را بزنید.');
          };
          speaking = true;
          setVoiceState('speaking', 'پخش پاسخ با صدای مرورگر…');
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          return;
        } catch {}
      }
      playReplyBtn.hidden = true;
      setVoiceState('ready', 'پاسخ به‌صورت نوشتاری آماده است؛ برای ادامه گفت‌وگو «شروع صحبت» را بزنید.');
    }
  }
  voiceBtn.disabled = !mediaRecorderAvailable;
  voiceBtn.setAttribute('aria-pressed', 'false');
  voiceBtn.addEventListener('click', () => {
    if (!mediaRecorderAvailable || voiceProcessing || speaking) return;
    if (recording) { stopRecording(); return; }
    if (!voiceMode) {
      voiceMode = true;
      voiceEndBtn.hidden = false;
      speakGreeting();
      return;
    }
    startRecording();
  });
  voiceEndBtn.addEventListener('click', stopVoiceMode);
  playReplyBtn.addEventListener('click', async () => {
    if (!currentAudio) return;
    try {
      await currentAudio.play();
      playReplyBtn.hidden = true;
      speaking = true;
      setVoiceState('speaking', 'پاسخ دستیار در حال پخش است…');
    } catch {
      setVoiceState('error', 'پخش پاسخ ممکن نشد؛ صدای دستگاه و تنظیمات مرورگر را بررسی کنید.');
    }
  });
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

  const sendBtn = h('button', { class: 'btn ai-send', type: 'button', text: voiceAllowed ? 'ارسال پیام' : 'ارسال' });
  const newBtn = h('button', { class: 'btn secondary', type: 'button', text: 'گفت‌وگوی تازه' });
  const status = h('p', { class: 'muted ai-status', role: 'status', 'aria-live': 'polite' });
  let acceptedConclusion = '';
  const acceptBtn = h('button', { class: 'btn ai-accept-consultation', type: 'button', text: 'نتیجه مشاوره را تأیید می‌کنم و می‌خواهم سند تنظیم شود', hidden: '' });
  const partyOneLabel = h('span', { text: 'خواهان ـ نام' });
  const partyTwoLabel = h('span', { text: 'خوانده ـ نام' });
  const partyOneAddressLabel = h('span', { text: 'خواهان ـ نشانی' });
  const partyTwoAddressLabel = h('span', { text: 'خوانده ـ نشانی' });
  const partyOneName = h('input', { type: 'text', class: 'ai-party-input', maxlength: '180', placeholder: 'نام و نام خانوادگی' });
  const partyOneAddress = h('textarea', { class: 'ai-party-input', rows: '2', maxlength: '1000', placeholder: 'نشانی کامل' });
  const partyTwoName = h('input', { type: 'text', class: 'ai-party-input', maxlength: '180', placeholder: 'نام و نام خانوادگی' });
  const partyTwoAddress = h('textarea', { class: 'ai-party-input', rows: '2', maxlength: '1000', placeholder: 'نشانی کامل' });
  function syncPartyLabels() {
    const labels = docSelect.value === 'contract' ? ['طرف اول', 'طرف دوم']
      : docSelect.value === 'criminal_complaint' ? ['شاکی', 'مشتکی‌عنه']
      : docSelect.value === 'appeal' ? ['تجدیدنظرخواه', 'تجدیدنظرخوانده']
      : docSelect.value === 'retrial' ? ['درخواست‌کننده اعاده دادرسی', 'طرف مقابل']
      : docSelect.value === 'third_party' ? ['معترض ثالث', 'طرف یا طرفین دعوای اصلی']
      : docSelect.value === 'opposition' ? ['واخواه', 'واخوانده']
      : docSelect.value === 'execution_objection' ? ['معترض یا محکوم‌علیه', 'طرف مقابل یا محکوم‌له']
      : ['خواهان', 'خوانده'];
    partyOneLabel.textContent = `${labels[0]} ـ نام`;
    partyOneAddressLabel.textContent = `${labels[0]} ـ نشانی`;
    partyTwoLabel.textContent = `${labels[1]} ـ نام`;
    partyTwoAddressLabel.textContent = `${labels[1]} ـ نشانی`;
  }
  const partyPanel = h('section', { class: 'ai-party-panel', hidden: '' }, [
    h('h3', { text: 'مشخصات اشخاص برای درج در سند' }),
    h('p', { class: 'muted', text: 'اطلاعات حقوقی و محتوای سند از گفت‌وگوی مشاوره استخراج می‌شود؛ اینجا فقط مشخصات و نشانی اشخاص را وارد کنید.' }),
    h('label', { class: 'ai-party-field' }, [partyOneLabel, partyOneName]),
    h('label', { class: 'ai-party-field' }, [partyOneAddressLabel, partyOneAddress]),
    h('label', { class: 'ai-party-field' }, [partyTwoLabel, partyTwoName]),
    h('label', { class: 'ai-party-field' }, [partyTwoAddressLabel, partyTwoAddress]),
  ]);
  acceptBtn.addEventListener('click', () => {
    const lastAnswer = [...history].reverse().find((item) => item.role === 'ai' && item.text)?.text || '';
    if (!lastAnswer) { status.textContent = 'ابتدا گفت‌وگوی مشاوره را تکمیل کنید.'; return; }
    stopVoiceMode();
    voicePanel.hidden = true;
    acceptedConclusion = lastAnswer;
    mode = 'draft';
    docSelect.value = 'petition';
    partyPanel.hidden = false;
    acceptBtn.hidden = true;
    syncMode();
    syncPartyLabels();
    status.textContent = 'نتیجه مشاوره تأیید شد. نوع سند و مشخصات اشخاص را تکمیل کنید.';
    docSelect.focus();
  });

  async function send() {
    if (busy) return;
    const rawTyped = composerText.value.trim();
    const contractLabel = CONTRACT_TYPES.find(([value]) => value === contractSelect.value)?.[1];
    let typed = rawTyped;
    if (mode === 'draft') {
      if (!acceptedConclusion) { status.textContent = 'تنظیم سند فقط پس از تأیید نتیجه مشاوره امکان‌پذیر است.'; return; }
      if (!partyOneName.value.trim() || !partyOneAddress.value.trim() || !partyTwoName.value.trim() || !partyTwoAddress.value.trim()) {
        status.textContent = 'نام و نشانی هر دو شخص را تکمیل کنید.';
        (!partyOneName.value.trim() ? partyOneName : !partyOneAddress.value.trim() ? partyOneAddress : !partyTwoName.value.trim() ? partyTwoName : partyTwoAddress).focus();
        return;
      }
      const partyLabel = docSelect.value === 'contract' ? 'طرف اول و طرف دوم قرارداد' : 'خواهان/شاکی و خوانده';
      const contractInfo = docSelect.value === 'contract' && contractLabel ? `\nنوع قرارداد: ${contractLabel}` : '';
      typed = [
        'نتیجه مشاوره که کاربر صریحاً تأیید کرده است:',
        'کاربر جمع‌بندی آخر مشاوره را صریحاً تأیید کرده است. تمام پیام‌های قبلی همین گفت‌وگو را برای استخراج مبانی و جزئیات به کار ببر.',
        `مشخصات ${partyLabel}:`,
        `شخص اول ـ نام: ${partyOneName.value.trim()}\nنشانی: ${partyOneAddress.value.trim()}`,
        `شخص دوم ـ نام: ${partyTwoName.value.trim()}\nنشانی: ${partyTwoAddress.value.trim()}`,
        contractInfo,
        rawTyped ? `توضیح تکمیلی کاربر: ${rawTyped}` : '',
      ].filter(Boolean).join('\n\n');
    }
    if (mode !== 'consult' && docSelect.value === 'contract' && !contractLabel) {
      status.textContent = 'ابتدا نوع قرارداد را از فهرست انتخاب کنید.';
      contractSelect.focus();
      return;
    }
    if (!typed && !attachments.length && mode !== 'draft') { status.textContent = 'ابتدا شرح پرونده یا متن را بنویسید یا فایلی پیوست کنید.'; return; }
    if (typed.length > MESSAGE_LIMIT) {
      status.textContent = `متن بیش از ${MESSAGE_LIMIT.toLocaleString('fa-IR')} نویسه است. آن را کوتاه‌تر کنید یا بخش بلند را به‌صورت فایل پیوست کنید.`;
      return;
    }
    if (mode === 'consult') acceptBtn.hidden = true;
    busy = true;
    if (voiceMode) { voiceProcessing = true; setVoiceState('processing', 'در حال ارسال پیام صوتی و دریافت پاسخ…'); }
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    pending.hidden = false;
    startPendingProgress();
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
      res = await postForm('/api/ai/assistant', form, { timeoutMs: 120000 });
    } else {
      res = await postJson('/api/ai/assistant', { mode, docType: docSelect.value, message: typed, history: trimHistory(history) }, { timeoutMs: 120000 });
    }
    stopPendingProgress();
    busy = false;
    if (voiceMode) { voiceProcessing = false; setVoiceState('ready', 'پاسخ دریافت شد؛ در حال آماده‌سازی ادامه گفت‌وگو…'); }
    else voiceBtn.disabled = !mediaRecorderAvailable;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    pending.hidden = true;
    if (!res.ok || !res.data?.ok) {
      const code = res.data?.error || (res.timeoutError ? 'AI_REQUEST_TIMEOUT' : res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE');
      const which = res.data?.file ? ` (فایل: ${res.data.file})` : '';
      status.textContent = `${errorText(code)}${which} (کد: ${code}${res.data?.providerStatus ? ` · HTTP ${res.data.providerStatus}` : ''}${res.data?.providerReason ? ` ${res.data.providerReason}` : ''}${res.data?.reason ? ` · ${res.data.reason}` : ''} متن و پیوست‌های شما حفظ شد.`;
      renderLog();
      if (voiceMode) setVoiceState('ready', 'ارسال گفتار ناموفق بود؛ متن حفظ شده است. برای تلاش دوباره «شروع صحبت» را بزنید.');
      return;
    }
    // فقط نام فایل‌ها در گفت‌وگو و تاریخچه می‌ماند؛ محتوای فایل هرگز ذخیره نمی‌شود.
    const names = sent.map((a) => a.file.name);
    const userText = [typed, names.length ? `[پیوست: ${names.join('، ')}]` : ''].filter(Boolean).join('\n');
    history.push({ role: 'user', text: userText });
    const reply = summarizeReply(res.data);
    const responseNotes = [...(res.data.notes || [])];
    history.push({ role: 'ai', text: reply, notes: responseNotes, disclaimer: res.data.status === 'ready' ? res.data.disclaimer : '', reviewReport: res.data.reviewReport && typeof res.data.reviewReport === 'object' ? res.data.reviewReport : null, reviewStatus: typeof res.data.reviewStatus === 'string' ? res.data.reviewStatus : null });
    composerText.value = '';
    counter.textContent = `0 / ${MESSAGE_LIMIT}`;
    attachments = [];
    renderAttachments();
    renderLog();
    const saved = await persistTurn(userText, reply).catch(() => false);
    if (mode === 'consult' && voiceMode) speakReply(reply);
    // گزینه ورود به تنظیم سند فقط با اعلام آمادگی صریح سرور، بدون سؤال باز و با جمع‌بندی واقعی ظاهر می‌شود.
    if (mode === 'consult' && res.data.status === 'ready' && !(res.data.questions || []).length && reply.trim().length >= 120) acceptBtn.hidden = false;
    status.textContent = saved
      ? (mode === 'consult'
        ? (res.data.status === 'ready' ? 'اگر با جمع‌بندی مشاوره موافقید، نتیجه را تأیید کنید تا وارد مرحله تنظیم سند شوید.' : 'برای تکمیل مشاوره، به پرسش‌های دستیار پاسخ دهید.')
        : (mode === 'litigation' ? (res.data.reviewReport ? 'پاسخ آماده شد؛ برای مشاهده گزارش بازبینی مستقل، دکمه کنار کپی پاسخ را بزنید.' : 'پاسخ آماده شد؛ بازبینی مستقل در این نوبت قابل ارائه نبود. پیش از اقدام، منابع رسمی را کنترل کنید.') : 'خروجی آماده است. آن را بررسی کنید؛ پیش از استفاده باید وکیل تطبیق دهد.'))
      : 'پاسخ نمایش داده شد، اما ذخیرهٔ آن در تاریخچه انجام نشد.';
  }

  function newConversation() {
    threadId = null;
    history.length = 0;
    stopVoiceMode();
    voicePanel.hidden = !voiceAllowed;
    acceptedConclusion = '';
    acceptBtn.hidden = true;
    partyPanel.hidden = true;
    partyOneName.value = '';
    partyOneAddress.value = '';
    partyTwoName.value = '';
    partyTwoAddress.value = '';
    mode = MODES.some(([value]) => value === initialMode) ? initialMode : 'consult';
    docSelect.value = initialMode === 'litigation' ? 'retrial' : initialMode === 'research' ? 'other' : DOC_TYPES[0][0];
    composerText.value = '';
    counter.textContent = `0 / ${MESSAGE_LIMIT}`;
    attachments = [];
    renderAttachments();
    syncMode();
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

  const toolbar = h('div', { class: voiceAllowed ? 'ai-toolbar ai-smart-toolbar' : 'ai-toolbar' }, [modeGroup, docWrap, contractWrap, newBtn]);
  const composer = h('form', { class: voiceAllowed ? 'ai-composer ai-chat-composer' : 'ai-composer', 'aria-label': voiceAllowed ? 'چت با دستیار' : 'ارسال پیام' }, [
    acceptBtn, partyPanel, attachChip,
    composerText,
    h('div', { class: 'ai-composer-bar' }, [attachBtn, fileInput, counter, sendBtn]),
    pending,
    voicePanel,
    status,
    h('p', { class: 'ai-history-link' }, [h('a', { href: '#/assistant/history', text: 'سوابق گفت‌وگوها ←' })]),
  ]);
  composer.addEventListener('submit', (e) => { e.preventDefault(); send(); });

  voicePanel.hidden = !voiceAllowed;
  syncMode();
  return h('div', { class: 'ai-shell' }, [
    h('section', { class: 'ai-main', 'aria-label': 'گفت‌وگو با دستیار' }, [workspaceIntro, toolbar, stream, composer]),
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
