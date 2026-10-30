// جلسهٔ دفاع شفاهی با هوش مصنوعی: قاضی یا وکیل طرف مقابل پرسش می‌کنند؛ پاسخ متنی یا صوتی؛ پاسخ AI با صدا پخش می‌شود؛ گزارش نهایی.
// این بخش فقط برای کاربر واردشده و وقتی سرویس روی سرور فعال است کار می‌کند؛ در غیر این صورت حالت قاعده‌محور نمایش داده می‌شود.
import { h } from './dom.js';
import { getJson, postJson } from './api.js';
import { aiStatus, errorText, postForBlob, createPlayer, blobToBase64, pickRecordingMime, baseMime } from './ai-client.js';
import { oralDefensePanel } from './moot-oral.js';

export const CASE_ID = 'contract-delivery-delay';
export const MAX_ANSWERS = 5;
export const MAX_RECORD_MS = 90 * 1000;
export const ANSWER_MAX = 1500;
const HISTORY_ITEMS = 12;
const HISTORY_CHARS = 20000;

export const ROLE_OPTIONS = [['judge', 'قاضی'], ['opposing', 'وکیل طرف مقابل']];
export const DIFFICULTY_OPTIONS = [['beginner', 'مبتدی'], ['intermediate', 'متوسط'], ['advanced', 'پیشرفته']];

/**
 * تاریخچه‌ای که به سرور می‌رود: از انتها، با سقف تعداد و طول. ترتیب زمانی حفظ می‌شود.
 * @param {Array<{role: 'ai'|'user', text: string}>} history
 */
export function historyForApi(history) {
  const picked = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && picked.length < HISTORY_ITEMS; i--) {
    const item = history[i];
    if (chars + item.text.length > HISTORY_CHARS) break;
    chars += item.text.length;
    picked.unshift({ role: item.role, text: item.text });
  }
  return picked;
}

function notice(text, cls = 'notice') {
  return h('div', { class: cls, role: 'note', text });
}

/** ورودی آماده‌شده برای ارسال: خالی یا بیش از حد طولانی را رد می‌کند. */
export function validAnswer(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'پاسخ خالی است.' };
  if (t.length > ANSWER_MAX) return { ok: false, error: `پاسخ بیش از ${ANSWER_MAX} نویسه است؛ کوتاه کنید.` };
  return { ok: true, text: t };
}

export function aiOralSession() {
  const player = createPlayer();
  const history = [];
  let role = 'judge';
  let difficulty = 'intermediate';
  let started = false;
  let answers = 0;
  let busy = false;
  let lastAiText = '';
  let lastBlob = null;
  let recorder = null;
  let recordTimer = null;

  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const roleSelect = h('select', { 'aria-label': 'نقش هوش مصنوعی' }, ROLE_OPTIONS.map(([v, t]) => h('option', { value: v, text: t })));
  const diffSelect = h('select', { 'aria-label': 'سطح دشواری' }, DIFFICULTY_OPTIONS.map(([v, t]) => h('option', { value: v, text: t })));
  roleSelect.value = role;
  diffSelect.value = difficulty;
  const startBtn = h('button', { class: 'btn', type: 'button', text: 'شروع دادرسی' });
  const log = h('ol', { class: 'oral-log', 'aria-label': 'متن گفت‌وگو' });
  const answer = h('textarea', { rows: '4', maxlength: String(ANSWER_MAX), 'aria-label': 'پاسخ دفاع', placeholder: 'دفاع خود را بنویسید یا با میکروفون بگویید…', disabled: '' });
  const micBtn = h('button', { class: 'btn secondary', type: 'button', text: 'ضبط با میکروفون', disabled: '' });
  const sendBtn = h('button', { class: 'btn', type: 'button', text: 'ارسال پاسخ', disabled: '' });
  const speakToggle = h('input', { type: 'checkbox', checked: '' });
  const replayBtn = h('button', { class: 'btn secondary', type: 'button', text: 'شنیدن دوباره', disabled: '' });
  const stopBtn = h('button', { class: 'btn secondary', type: 'button', text: 'توقف صدا' });
  const endBtn = h('button', { class: 'btn secondary', type: 'button', text: 'پایان و گزارش ارزیابی', disabled: '' });
  const report = h('div', { role: 'region', 'aria-live': 'polite' });

  const micSupported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
  if (!micSupported) micBtn.disabled = true;

  function setBusy(on, text = '') {
    busy = on;
    status.textContent = text;
    sendBtn.disabled = on || !started || answers >= MAX_ANSWERS;
    startBtn.disabled = on || started;
    endBtn.disabled = on || answers < 1;
    replayBtn.disabled = on || !lastBlob && !lastAiText;
  }

  function render() {
    log.replaceChildren(...history.map((m) => h('li', { class: m.role === 'ai' ? 'oral-ai' : 'oral-user' }, [
      h('strong', { text: m.role === 'ai' ? (role === 'judge' ? 'قاضی: ' : 'وکیل طرف مقابل: ') : 'شما: ' }),
      document.createTextNode(m.text),
    ])));
    answer.disabled = !started || answers >= MAX_ANSWERS || busy;
    micBtn.disabled = !micSupported || !started || answers >= MAX_ANSWERS || busy;
    if (started && answers >= MAX_ANSWERS) status.textContent = 'حداکثر تعداد پاسخ‌ها ثبت شد. گزارش را بسازید.';
    setBusy(busy, status.textContent);
  }

  async function speak(text) {
    if (!speakToggle.checked) {
      setBusy(false, 'پاسخ آماده است.');
      render();
      return;
    }
    setBusy(true, 'در حال تولید صدای پاسخ…');
    const res = await postForBlob('/api/ai/speech', { text }, { timeoutMs: 40000 });
    if (!res.ok) {
      setBusy(false, `${errorText(res.error)} متن پاسخ را بخوانید.`);
      render();
      return;
    }
    lastBlob = res.blob;
    const played = await player.play(res.blob);
    if (played.ok) setBusy(false, 'در حال پخش پاسخ. با «توقف صدا» قطع کنید.');
    else setBusy(false, 'مرورگر پخش خودکار را متوقف کرد. روی «شنیدن دوباره» بزنید.');
    render();
  }

  startBtn.addEventListener('click', async () => {
    player.unlock();
    role = roleSelect.value;
    difficulty = diffSelect.value;
    roleSelect.disabled = true;
    diffSelect.disabled = true;
    started = true;
    setBusy(true, 'در حال آماده‌سازی نخستین پرسش…');
    const res = await postJson('/api/ai/moot/turn', { caseId: CASE_ID, role, difficulty, history: [] }, { timeoutMs: 40000 });
    if (!res.ok || !res.data?.reply) {
      started = false;
      roleSelect.disabled = false;
      diffSelect.disabled = false;
      setBusy(false, errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE')));
      render();
      return;
    }
    history.push({ role: 'ai', text: res.data.reply });
    lastAiText = res.data.reply;
    render();
    await speak(res.data.reply);
  });

  sendBtn.addEventListener('click', async () => {
    const v = validAnswer(answer.value);
    if (!v.ok) { status.textContent = v.error; return; }
    player.unlock();
    const before = historyForApi(history);
    history.push({ role: 'user', text: v.text });
    answers += 1;
    answer.value = '';
    render();
    setBusy(true, 'در حال تولید پرسش بعدی…');
    const res = await postJson('/api/ai/moot/turn', { caseId: CASE_ID, role, difficulty, history: before, answer: v.text }, { timeoutMs: 40000 });
    if (!res.ok || !res.data?.reply) {
      history.pop();
      answers -= 1;
      answer.value = v.text;
      setBusy(false, `${errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE'))} پاسخ شما در کادر باقی ماند.`);
      render();
      return;
    }
    history.push({ role: 'ai', text: res.data.reply });
    lastAiText = res.data.reply;
    lastBlob = null;
    render();
    await speak(res.data.reply);
  });

  replayBtn.addEventListener('click', async () => {
    player.unlock();
    if (lastBlob) {
      const played = await player.play(lastBlob);
      status.textContent = played.ok ? 'در حال پخش…' : 'پخش شروع نشد؛ دوباره بزنید.';
      return;
    }
    if (lastAiText) await speak(lastAiText);
  });

  stopBtn.addEventListener('click', () => { player.stop(); status.textContent = 'صدا متوقف شد.'; });

  // ضبط: سقف زمانی و حجمی دارد؛ متن تشخیص‌داده‌شده در کادر می‌آید تا کاربر پیش از ارسال اصلاح کند.
  let chunks = [];
  micBtn.addEventListener('click', async () => {
    if (recorder) { recorder.stop(); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      status.textContent = err?.name === 'NotFoundError'
        ? 'میکروفونی پیدا نشد. پاسخ را بنویسید.'
        : 'دسترسی به میکروفون داده نشد. اجازهٔ میکروفون را در مرورگر بدهید یا پاسخ را بنویسید.';
      return;
    }
    const mime = pickRecordingMime();
    chunks = [];
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      clearTimeout(recordTimer);
      stream.getTracks().forEach((t) => t.stop());
      const type = baseMime(recorder?.mimeType || mime || 'audio/webm');
      recorder = null;
      micBtn.textContent = 'ضبط با میکروفون';
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) { status.textContent = 'صدایی ضبط نشد.'; return; }
      if (blob.size > 2 * 1024 * 1024) { status.textContent = 'ضبط بیش از حد بزرگ است؛ کوتاه‌تر ضبط کنید.'; return; }
      setBusy(true, 'در حال تبدیل صدا به متن…');
      const data = await blobToBase64(blob);
      const res = await postJson('/api/ai/transcribe', { mimeType: type, data }, { timeoutMs: 60000 });
      if (res.ok && res.data?.text) {
        answer.value = [answer.value.trim(), res.data.text.trim()].filter(Boolean).join(' ').slice(0, ANSWER_MAX);
        setBusy(false, 'متن ضبط‌شده در کادر آمد. آن را بررسی و سپس ارسال کنید.');
      } else {
        setBusy(false, `${errorText(res.data?.error || 'AI_UNAVAILABLE')} می‌توانید پاسخ را بنویسید.`);
      }
      render();
    };
    recorder.start();
    micBtn.textContent = 'توقف ضبط';
    status.textContent = 'در حال ضبط… (حداکثر ۹۰ ثانیه)';
    recordTimer = setTimeout(() => recorder && recorder.stop(), MAX_RECORD_MS);
  });

  endBtn.addEventListener('click', async () => {
    if (answers < 1) return;
    player.stop();
    setBusy(true, 'در حال ساختن گزارش ارزیابی…');
    const res = await postJson('/api/ai/moot/evaluate', { caseId: CASE_ID, history: historyForApi(history) }, { timeoutMs: 60000 });
    if (!res.ok || !res.data?.report) {
      setBusy(false, errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE')));
      render();
      return;
    }
    const r = res.data.report;
    const list = (title, items) => (Array.isArray(items) && items.length
      ? [h('h4', { text: title }), h('ul', {}, items.map((x) => h('li', { text: String(x) })))]
      : []);
    report.replaceChildren(
      h('h3', { text: `گزارش ارزیابی آموزشی — نمرهٔ کلی ${Number.isFinite(r.overallScore) ? r.overallScore : '—'} از ۱۰۰` }),
      ...list('نقاط قوت دفاع', r.strengths),
      ...list('ضعف‌های استدلالی', r.weaknesses),
      ...list('ایرادهای حقوقی یا شکلی احتمالی', r.legalOrProcedural),
      ...list('پرسش‌های بی‌پاسخ', r.unanswered),
      h('p', { text: `کیفیت پاسخ‌ها: ${r.answerQuality || '—'}` }),
      h('p', { text: `تناسب استنادها: ${r.citationFit || '—'}` }),
      h('p', {}, [h('strong', { text: 'تمرین بعدی: ' }), document.createTextNode(r.nextPractice || '—')]),
      h('p', { class: 'muted', text: res.data.disclaimer || '' }),
    );
    setBusy(false, 'گزارش آماده است.');
    render();
  });

  render();
  return h('div', { class: 'oral-ai' }, [
    h('div', { class: 'row' }, [
      h('label', {}, [document.createTextNode('نقش: '), roleSelect]),
      h('label', {}, [document.createTextNode('سطح: '), diffSelect]),
    ]),
    h('div', { class: 'row' }, [startBtn]),
    log,
    answer,
    h('div', { class: 'row' }, [micBtn, sendBtn, endBtn]),
    h('div', { class: 'row' }, [replayBtn, stopBtn, h('label', {}, [speakToggle, document.createTextNode(' پخش صدای پاسخ')])]),
    status,
    report,
  ]);
}

/** بخش دفاع شفاهی صفحهٔ موت‌کورت: AI برای کاربر واردشده و سرویس فعال؛ در غیر این صورت حالت قاعده‌محور. */
export function oralDefenseSection() {
  const box = h('div', { class: 'oral-defense-wrap' }, [h('p', { class: 'muted', text: 'در حال بررسی امکان دفاع شفاهی…' })]);
  (async () => {
    const [status, me] = await Promise.all([aiStatus(), getJson('/api/me')]);
    const children = [h('h2', { text: 'دفاع شفاهی' })];
    if (!me.ok) {
      children.push(notice('برای دفاع شفاهی با هوش مصنوعی ابتدا وارد حساب خود شوید. تا آن زمان حالت آموزشی قاعده‌محور در دسترس است.'));
      box.replaceChildren(...children, oralDefensePanel());
      return;
    }
    if (!status.configured) {
      children.push(notice('سرویس هوش مصنوعی هنوز روی سرور فعال نشده است؛ حالت آموزشی قاعده‌محور در دسترس است.'));
      box.replaceChildren(...children, oralDefensePanel());
      return;
    }
    children.push(h('p', { class: 'muted', text: 'پرسش‌ها بر اساس پاسخ‌های شما ساخته می‌شوند. صدای پاسخ در مرورگر پخش می‌شود و فایل صوتی شما فقط برای تبدیل به متن فرستاده می‌شود. این تمرین آموزشی است و جایگزین مشاورهٔ حقوقی نیست.' }));
    box.replaceChildren(...children, aiOralSession());
  })();
  return box;
}
