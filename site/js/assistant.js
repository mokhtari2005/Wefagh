// دستیار هوشمند وکیل: گفت‌وگوی حرفه‌ای با تاریخچه، کادر ارسال ثابت و بارگذاری متن سند.
// فقط برای کاربر واردشده و وقتی سرویس روی سرور فعال است. هر دکمه‌ای که نشان داده می‌شود عملکرد واقعی دارد.
import { h } from './dom.js';
import { getJson, postJson, sendJson } from './api.js';
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

const MESSAGE_LIMIT = 6000;
const FILE_LIMIT_BYTES = 200 * 1024;
const TEXT_FILE_RE = /\.(txt|md|csv)$/i;
const SUGGESTIONS = [
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

export function assistantPage() {
  const wrap = h('div', { class: 'assistant' }, [
    h('span', { class: 'section-kicker', text: 'آکادمی وفاق · ابزار حرفه‌ای' }),
    h('h1', { text: 'دستیار هوشمند وکیل' }),
    h('p', { class: 'lead', text: 'تنظیم پیش‌نویس اسناد، تحلیل پرونده و بازبینی متن حقوقی.' }),
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

function assistantWorkspace() {
  const history = [];
  let busy = false;
  let threadId = null;
  let attachment = null; // { name, text }

  // ---------- فهرست گفت‌وگوها ----------
  const threadList = h('ul', { class: 'ai-thread-list', 'aria-label': 'گفت‌وگوهای قبلی' });
  const threadStatus = h('p', { class: 'muted ai-thread-status', role: 'status', 'aria-live': 'polite' });

  async function refreshThreads() {
    const res = await getJson('/api/ai/threads');
    if (!res.ok) {
      threadList.replaceChildren(h('li', { class: 'muted', text: 'فهرست گفت‌وگوها در دسترس نیست.' }));
      return;
    }
    const rows = res.data?.threads || [];
    if (!rows.length) {
      threadList.replaceChildren(h('li', { class: 'muted', text: 'هنوز گفت‌وگویی ذخیره نشده است.' }));
      return;
    }
    threadList.replaceChildren(...rows.map((t) => {
      const open = h('button', { class: 'ai-thread-open', type: 'button', text: t.title || 'گفت‌وگو' });
      open.setAttribute('aria-current', Number(t.id) === threadId ? 'true' : 'false');
      open.addEventListener('click', () => loadThread(t.id));
      const del = h('button', { class: 'ai-thread-del', type: 'button', text: 'حذف', 'aria-label': `حذف گفت‌وگوی ${t.title || ''}` });
      del.addEventListener('click', () => deleteThread(t.id));
      return h('li', { class: 'ai-thread-item' }, [open, del]);
    }));
  }

  async function loadThread(id) {
    const res = await getJson(`/api/ai/threads/${encodeURIComponent(id)}/messages`);
    if (!res.ok) { threadStatus.textContent = 'بازیابی گفت‌وگو انجام نشد.'; return; }
    history.length = 0;
    for (const m of res.data?.messages || []) history.push({ role: m.role === 'ai' ? 'ai' : 'user', text: m.content });
    threadId = Number(id);
    renderLog();
    threadStatus.textContent = 'گفت‌وگو بازیابی شد. ادامه دهید.';
    refreshThreads();
  }

  async function deleteThread(id) {
    if (!window.confirm('این گفت‌وگو حذف شود؟')) return;
    const res = await sendJson('DELETE', `/api/ai/threads/${encodeURIComponent(id)}`, null);
    if (!res.ok) { threadStatus.textContent = 'حذف گفت‌وگو انجام نشد.'; return; }
    if (Number(id) === threadId) newConversation();
    threadStatus.textContent = 'گفت‌وگو حذف شد.';
    refreshThreads();
  }

  async function persistTurn(userText, aiText) {
    if (!threadId) {
      const created = await postJson('/api/ai/threads', { title: userText.slice(0, 60) });
      if (!created.ok || !created.data?.thread?.id) return false;
      threadId = created.data.thread.id;
    }
    const a = await postJson(`/api/ai/threads/${threadId}/messages`, { role: 'user', content: userText });
    const b = await postJson(`/api/ai/threads/${threadId}/messages`, { role: 'ai', content: aiText });
    refreshThreads();
    return a.ok && b.ok;
  }

  // ---------- حالت و نوع سند ----------
  let mode = 'draft';
  const modeGroup = h('div', { class: 'ai-seg', role: 'group', 'aria-label': 'نوع کار' });
  const modeButtons = MODES.map(([value, label]) => {
    const b = h('button', { class: 'ai-seg-btn', type: 'button', text: label });
    b.setAttribute('aria-pressed', value === mode ? 'true' : 'false');
    b.addEventListener('click', () => {
      mode = value;
      modeButtons.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      docWrap.hidden = mode !== 'draft';
    });
    return b;
  });
  modeGroup.append(...modeButtons.map((b, i) => b));
  const docSelect = h('select', { 'aria-label': 'نوع سند' }, DOC_TYPES.map(([v, t]) => h('option', { value: v, text: t })));
  const docWrap = h('label', { class: 'ai-doc-picker' }, [h('span', { text: 'نوع سند' }), docSelect]);

  // ---------- گفت‌وگو ----------
  const emptyState = h('div', { class: 'ai-empty' }, [
    h('p', { class: 'lead', text: 'شرح پرونده یا متن خود را بنویسید. پاسخ‌ها بر پایهٔ همان اطلاعات تنظیم می‌شوند و در صورت نبود منبع معتبر، صریحاً اعلام می‌شود.' }),
    h('div', { class: 'ai-suggestions' }, SUGGESTIONS.map(([m, d, text]) => {
      const b = h('button', { class: 'btn secondary ai-suggestion', type: 'button', text });
      b.addEventListener('click', () => {
        mode = m;
        modeButtons.forEach((x, i) => x.setAttribute('aria-pressed', MODES[i][0] === m ? 'true' : 'false'));
        docWrap.hidden = m !== 'draft';
        docSelect.value = d;
        composerText.value = text;
        composerText.focus();
      });
      return b;
    })),
  ]);
  const pending = h('li', { class: 'ai-msg ai-pending', role: 'status', text: 'در حال تنظیم پاسخ… این کار ممکن است چند ثانیه طول بکشد.' });
  pending.hidden = true;
  const log = h('ol', { class: 'ai-log', 'aria-label': 'گفت‌وگو' });
  const stream = h('div', { class: 'ai-stream', tabindex: '-1' }, [emptyState, log]);

  function aiMessageNode(m) {
    const actions = h('div', { class: 'ai-msg-actions' });
    const copy = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'کپی' });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(m.text); status.textContent = 'متن پاسخ کپی شد.'; } catch { status.textContent = 'کپی انجام نشد؛ متن را دستی انتخاب کنید.'; }
    });
    const dl = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'دریافت فایل متنی' });
    dl.addEventListener('click', () => downloadText(m.text, 'پیش‌نویس-وفاق.txt'));
    actions.append(copy, dl);
    const children = [h('span', { class: 'ai-role', text: 'دستیار' }), h('div', { class: 'ai-text pre-wrap', text: m.text })];
    if (m.notes?.length) children.push(h('ul', { class: 'ai-notes', 'aria-label': 'یادداشت‌های بررسی' }, m.notes.map((n) => h('li', { text: n }))));
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
  const fileInput = h('input', { type: 'file', accept: '.txt,.md,.csv', hidden: '', 'aria-hidden': 'true', tabindex: '-1' });
  const attachBtn = h('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری متن سند' });
  attachBtn.addEventListener('click', () => fileInput.click());
  const attachChip = h('div', { class: 'ai-attachment', hidden: '' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!TEXT_FILE_RE.test(file.name)) { status.textContent = 'فعلاً فقط فایل‌های متنی با پسوند txt، md یا csv پشتیبانی می‌شوند. متن سند را کپی و در کادر بچسبانید.'; return; }
    if (file.size > FILE_LIMIT_BYTES) { status.textContent = 'حجم فایل بیش از ۲۰۰ کیلوبایت است. بخش مورد نیاز را در کادر بچسبانید.'; return; }
    attachment = { name: file.name, text: await file.text() };
    attachChip.replaceChildren(
      h('span', { text: `سند پیوست: ${attachment.name}` }),
      (() => { const x = h('button', { class: 'btn secondary ai-mini', type: 'button', text: 'حذف پیوست' }); x.addEventListener('click', () => { attachment = null; attachChip.hidden = true; }); return x; })(),
    );
    attachChip.hidden = false;
    status.textContent = 'سند پیوست شد. با ارسال، متن آن همراه پیام فرستاده می‌شود.';
  });

  const sendBtn = h('button', { class: 'btn ai-send', type: 'button', text: 'ارسال' });
  const newBtn = h('button', { class: 'btn secondary', type: 'button', text: 'گفت‌وگوی تازه' });
  const status = h('p', { class: 'muted ai-status', role: 'status', 'aria-live': 'polite' });

  function buildPayloadMessage() {
    const typed = composerText.value.trim();
    if (!attachment) return typed;
    return `${typed}\n\n--- متن سند پیوست (${attachment.name}) ---\n${attachment.text}`.trim();
  }

  async function send() {
    if (busy) return;
    const typed = composerText.value.trim();
    if (!typed && !attachment) { status.textContent = 'ابتدا شرح پرونده یا متن را بنویسید.'; return; }
    const text = buildPayloadMessage();
    if (text.length > MESSAGE_LIMIT) {
      status.textContent = `متن شامل سند پیوست بیش از ${MESSAGE_LIMIT.toLocaleString('fa-IR')} نویسه است. بخشی از سند را جدا کنید یا پیام را کوتاه‌تر کنید.`;
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    pending.hidden = false;
    log.append(pending);
    emptyState.hidden = true;
    stream.scrollTop = stream.scrollHeight;
    status.textContent = '';
    const payload = { mode, message: text, history: trimHistory(history) };
    if (mode === 'draft') payload.docType = docSelect.value;
    const res = await postJson('/api/ai/assistant', payload, { timeoutMs: 60000 });
    busy = false;
    sendBtn.disabled = false;
    pending.hidden = true;
    pending.remove();
    if (!res.ok || !res.data?.ok) {
      const code = res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE');
      status.textContent = `${errorText(code)} متن شما در کادر باقی ماند.`;
      renderLog();
      return;
    }
    const userText = typed || `سند پیوست: ${attachment?.name || ''}`;
    history.push({ role: 'user', text: userText });
    const reply = summarizeReply(res.data);
    history.push({ role: 'ai', text: reply, notes: res.data.notes || [], disclaimer: res.data.status === 'ready' ? res.data.disclaimer : '' });
    composerText.value = '';
    counter.textContent = `0 / ${MESSAGE_LIMIT}`;
    attachment = null;
    attachChip.hidden = true;
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
    attachment = null;
    attachChip.hidden = true;
    renderLog();
    status.textContent = '';
    threadStatus.textContent = '';
    refreshThreads();
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

  refreshThreads();
  renderLog();

  const threadsPanel = h('details', { class: 'ai-threads', open: '' }, [
    h('summary', { text: 'تاریخچهٔ گفت‌وگوها' }),
    threadList,
    threadStatus,
  ]);
  const toolbar = h('div', { class: 'ai-toolbar' }, [modeGroup, docWrap, newBtn]);
  const composer = h('form', { class: 'ai-composer', 'aria-label': 'ارسال پیام' }, [
    attachChip,
    composerText,
    h('div', { class: 'ai-composer-bar' }, [attachBtn, fileInput, counter, sendBtn]),
    status,
  ]);
  composer.addEventListener('submit', (e) => { e.preventDefault(); send(); });

  return h('div', { class: 'ai-shell' }, [
    h('aside', { class: 'ai-side' }, [threadsPanel]),
    h('section', { class: 'ai-main', 'aria-label': 'گفت‌وگو با دستیار' }, [toolbar, stream, composer]),
  ]);
}
