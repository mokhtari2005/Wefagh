// جلسهٔ شبیه‌سازی دادگاه با هوش مصنوعی: منشی، قاضی، وکیل خواهان و وکیل خوانده؛ کاربر یکی از دو طرف را بازی می‌کند.
// منشی متن ثابت دارد؛ قاضی و طرف مقابل از سرور (Gemini) پاسخ می‌گیرند. صدا با TTS و ورودی با تبدیل گفتار به متن.
// این بخش فقط برای کاربر واردشده و وقتی سرویس روی سرور فعال است کار می‌کند؛ وگرنه حالت قاعده‌محور نشان داده می‌شود.
import { h } from './dom.js';
import { getJson, postJson } from './api.js';
import { aiStatus, errorText, postForBlob, createPlayer, blobToBase64, pickRecordingMime, baseMime } from './ai-client.js';
import { oralDefensePanel } from './moot-oral.js';

export const CASE_ID = 'contract-delivery-delay';
export const CASE_SUBJECT = 'مطالبهٔ خسارت تأخیر در تحویل ۱۰۰ دستگاه و فسخ جزئی قرارداد';
export const MAX_RECORD_MS = 90 * 1000;
export const ANSWER_MAX = 1500;
const HISTORY_ITEMS = 30;
const HISTORY_CHARS = 24000;

export const SIDE_OPTIONS = [['plaintiff', 'وکیل خواهان (شرکت ب)'], ['defendant', 'وکیل خوانده (آقای الف)']];
export const DIFFICULTY_OPTIONS = [['beginner', 'مبتدی'], ['intermediate', 'متوسط'], ['advanced', 'پیشرفته']];
export const SPEED_OPTIONS = [[0.75, '۰٫۷۵×'], [1, '۱×'], [1.25, '۱٫۲۵×'], [1.5, '۱٫۵×']];

export const SPEAKER_LABEL = Object.freeze({ clerk: 'منشی دادگاه', judge: 'قاضی', plaintiff: 'وکیل خواهان', defendant: 'وکیل خوانده' });
export const VOICE_FOR = Object.freeze({ clerk: 'Leda', judge: 'Charon', plaintiff: 'Puck', defendant: 'Kore' });

/**
 * مراحل رسیدگی به ترتیب. speaker مشخص می‌کند نوبت با کیست؛ اگر همان طرف کاربر باشد، کاربر پاسخ می‌دهد.
 * stage کلیدی از HEARING_STAGES سرور است؛ text فقط برای منشی.
 */
export function hearingScript() {
  return [
    { id: 'open', speaker: 'clerk', text: 'جلسه تشکیل می‌شود. لطفاً همگی آماده باشند. دادرسی به‌صورت آموزشی و بر اساس پروندهٔ فرضی برگزار می‌شود.' },
    { id: 'subject', speaker: 'clerk', text: `موضوع دعوا: ${CASE_SUBJECT}.` },
    { id: 'claim', speaker: 'plaintiff', stage: 'claim', label: 'طرح ادعا' },
    { id: 'defense', speaker: 'defendant', stage: 'defense', label: 'دفاع' },
    { id: 'q_plaintiff', speaker: 'judge', stage: 'judge_question_plaintiff', label: 'پرسش قاضی از خواهان' },
    { id: 'a_plaintiff', speaker: 'plaintiff', stage: 'judge_question_plaintiff', label: 'پاسخ خواهان به قاضی' },
    { id: 'q_defendant', speaker: 'judge', stage: 'judge_question_defendant', label: 'پرسش قاضی از خوانده' },
    { id: 'a_defendant', speaker: 'defendant', stage: 'judge_question_defendant', label: 'پاسخ خوانده به قاضی' },
    { id: 'docs', speaker: 'plaintiff', stage: 'documents', label: 'ارائهٔ مستندات' },
    { id: 'rebut_p', speaker: 'plaintiff', stage: 'rebuttal_plaintiff', label: 'پاسخ متقابل خواهان' },
    { id: 'rebut_d', speaker: 'defendant', stage: 'rebuttal_defendant', label: 'پاسخ متقابل خوانده' },
    { id: 'close', speaker: 'clerk', text: 'ختم رسیدگی اعلام می‌شود. گزارش ارزیابی آموزشی آماده می‌شود.' },
  ];
}

/** تاریخچه‌ای که به سرور می‌رود: از انتها، با سقف تعداد و طول؛ ترتیب زمانی حفظ می‌شود. */
export function historyForApi(history) {
  const picked = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && picked.length < HISTORY_ITEMS; i--) {
    const item = history[i];
    if (chars + item.text.length > HISTORY_CHARS) break;
    chars += item.text.length;
    picked.unshift({ role: item.role, speaker: item.speaker, text: item.text });
  }
  return picked;
}

/** ورودی آماده‌شده برای ارسال: خالی یا بیش از حد طولانی را رد می‌کند. */
export function validAnswer(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, error: 'پاسخ خالی است.' };
  if (t.length > ANSWER_MAX) return { ok: false, error: `پاسخ بیش از ${ANSWER_MAX} نویسه است؛ کوتاه کنید.` };
  return { ok: true, text: t };
}

/** وضعیت هر مرحله برای نمایش: گذشته، جاری یا آینده. */
export function stepStates(total, current) {
  return Array.from({ length: total }, (_, i) => (i < current ? 'done' : i === current ? 'current' : 'pending'));
}

function notice(text, cls = 'notice') {
  return h('div', { class: cls, role: 'note', text });
}

export function hearingSession({ side, difficulty, speechOn, initialRate = 1 }) {
  const script = hearingScript();
  const userSide = side;
  const player = createPlayer();
  const history = [];
  let index = 0;
  let busy = false;
  let lastBlob = null;
  let lastText = '';
  let lastSpeaker = null;
  let finished = false;
  let recorder = null;
  let recordTimer = null;
  let chunks = [];

  const banner = h('p', { class: 'hearing-banner', role: 'status', 'aria-live': 'polite' });
  const stepList = h('ol', { class: 'hearing-steps', 'aria-label': 'مراحل رسیدگی' });
  const log = h('ol', { class: 'hearing-log', 'aria-label': 'متن مذاکرات', 'aria-live': 'polite' });
  const inputArea = h('div', { class: 'hearing-input' });
  const answer = h('textarea', { rows: '4', maxlength: String(ANSWER_MAX), 'aria-label': 'پاسخ شما در دادگاه', placeholder: 'پاسخ خود را بنویسید یا با میکروفون بگویید…' });
  const micBtn = h('button', { class: 'btn secondary', type: 'button', text: 'ضبط با میکروفون' });
  const submitBtn = h('button', { class: 'btn', type: 'button', text: 'ثبت پاسخ و ادامه' });
  const nextBtn = h('button', { class: 'btn', type: 'button', text: 'ادامه', disabled: '' });
  const controls = h('div', { class: 'hearing-audio', 'aria-label': 'کنترل صدا' });
  const stopBtn = h('button', { class: 'btn secondary', type: 'button', text: 'توقف' });
  const replayBtn = h('button', { class: 'btn secondary', type: 'button', text: 'تکرار', disabled: '' });
  const speedSelect = h('select', { 'aria-label': 'سرعت صدا' }, SPEED_OPTIONS.map(([v, t]) => h('option', { value: String(v), text: t })));
  const speakToggle = h('input', { type: 'checkbox' });
  if (speechOn) speakToggle.checked = true;
  speedSelect.value = String(initialRate);
  player.setRate(initialRate);
  const restartBtn = h('button', { class: 'btn secondary', type: 'button', text: 'جلسهٔ تازه' });
  restartBtn.addEventListener('click', () => location.reload());
  const report = h('div', { role: 'region', 'aria-live': 'polite' });
  const audioStatus = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const micSupported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
  if (!micSupported) micBtn.disabled = true;

  controls.append(stopBtn, replayBtn, speedSelect, h('label', {}, [speakToggle, document.createTextNode(' پخش صدای بازیگران')]));

  function currentStep() { return script[index]; }
  function userTurn() {
    const s = currentStep();
    return Boolean(s && s.speaker === userSide);
  }

  function renderSteps() {
    const states = stepStates(script.length, index);
    stepList.replaceChildren(...script.map((s, i) => h('li', {
      class: `hearing-step ${states[i]}`,
      ...(states[i] === 'current' ? { 'aria-current': 'step' } : {}),
    }, [
      h('span', { class: 'num', 'aria-hidden': 'true', text: String(i + 1) }),
      h('span', { text: s.label || SPEAKER_LABEL[s.speaker] || '' }),
    ])));
  }

  function renderLog() {
    log.replaceChildren(...history.map((m) => h('li', { class: `hearing-line ${m.speaker}` }, [
      h('strong', { text: `${SPEAKER_LABEL[m.speaker] || 'شما'}: ` }),
      h('span', { class: 'pre-wrap', text: m.text }),
    ])));
    log.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }

  function renderInput(show) {
    inputArea.replaceChildren();
    if (!show) return;
    inputArea.append(
      h('label', { class: 'visually-hidden', for: 'hearing-answer-input', text: 'پاسخ شما' }),
      answer,
      h('div', { class: 'row' }, [micBtn, submitBtn]),
    );
    answer.id = 'hearing-answer-input';
    answer.disabled = busy;
    submitBtn.disabled = busy;
    micBtn.disabled = busy || !micSupported;
  }

  function setBanner(text) { banner.textContent = text; }

  function setBusy(on) {
    busy = on;
    nextBtn.disabled = on || !lastBlob && !lastText || userTurn() || finished;
    submitBtn.disabled = on;
    replayBtn.disabled = on || !lastText;
  }

  async function speak(text, speaker) {
    if (!speakToggle.checked) return;
    audioStatus.textContent = 'در حال تولید صدا…';
    const res = await postForBlob('/api/ai/speech', { text, voice: VOICE_FOR[speaker] || 'Kore' }, { timeoutMs: 40000 });
    if (!res.ok) {
      audioStatus.textContent = `${errorText(res.error)} متن را بخوانید و ادامه دهید.`;
      return;
    }
    lastBlob = res.blob;
    replayBtn.disabled = false;
    const played = await player.play(res.blob);
    audioStatus.textContent = played.ok ? 'در حال پخش. می‌توانید با «توقف» قطع کنید.' : 'پخش خودکار در این مرورگر مجاز نیست. روی «تکرار» بزنید.';
  }

  /** نوبت فعلی را اجرا می‌کند: منشی یا هوش مصنوعی خودکار، کاربر با ورودی خودش. */
  async function runCurrent() {
    renderSteps();
    renderInput(false);
    const step = currentStep();
    if (!step) return finish();
    if (step.speaker === 'clerk') {
      setBanner(`نوبت: ${SPEAKER_LABEL.clerk}`);
      addLine('clerk', step.text);
      await speak(step.text, 'clerk');
      setBusy(false);
      nextBtn.disabled = false;
      return;
    }
    if (userTurn()) {
      setBanner(`نوبت شماست: ${SPEAKER_LABEL[step.speaker]} — ${step.label}`);
      renderInput(true);
      setBusy(false);
      answer.focus?.();
      return;
    }
    setBanner(`نوبت: ${SPEAKER_LABEL[step.speaker]} (در حال پاسخ…)`);
    setBusy(true);
    const res = await postJson('/api/ai/moot/turn', {
      caseId: CASE_ID, role: step.speaker, stage: step.stage, difficulty, history: historyForApi(history),
    }, { timeoutMs: 45000 });
    if (!res.ok || !res.data?.reply) {
      setBanner(errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE')) + ' برای ادامه دوباره تلاش کنید.');
      setBusy(false);
      nextBtn.disabled = false;
      nextBtn.textContent = 'تلاش دوباره';
      return;
    }
    nextBtn.textContent = 'ادامه';
    addLine(step.speaker, res.data.reply);
    await speak(res.data.reply, step.speaker);
    setBusy(false);
    nextBtn.disabled = false;
  }

  function addLine(speaker, text, fromUser = false) {
    history.push({ role: fromUser ? 'user' : 'ai', speaker, text });
    lastText = text;
    lastSpeaker = speaker;
    renderLog();
  }

  function advance() {
    index += 1;
    lastBlob = null;
    runCurrent();
  }

  nextBtn.addEventListener('click', () => {
    if (nextBtn.textContent === 'تلاش دوباره') { nextBtn.textContent = 'ادامه'; runCurrent(); return; }
    player.stop();
    advance();
  });

  submitBtn.addEventListener('click', async () => {
    const v = validAnswer(answer.value);
    if (!v.ok) { audioStatus.textContent = v.error; return; }
    player.unlock();
    player.stop();
    addLine(userSide, v.text, true);
    answer.value = '';
    renderInput(false);
    advance();
  });

  replayBtn.addEventListener('click', async () => {
    player.unlock();
    if (lastBlob) {
      const played = await player.play(lastBlob);
      audioStatus.textContent = played.ok ? 'در حال پخش…' : 'پخش شروع نشد؛ دوباره بزنید.';
      return;
    }
    if (lastText && lastSpeaker) await speak(lastText, lastSpeaker);
  });

  stopBtn.addEventListener('click', () => { player.stop(); audioStatus.textContent = 'صدا متوقف شد.'; });
  speedSelect.addEventListener('change', () => { player.setRate(Number(speedSelect.value)); });

  // ضبط: سقف زمانی دارد؛ متن تشخیص‌داده‌شده در کادر می‌آید تا پیش از ارسال اصلاح شود.
  micBtn.addEventListener('click', async () => {
    if (recorder) { recorder.stop(); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      audioStatus.textContent = err?.name === 'NotFoundError'
        ? 'میکروفونی پیدا نشد. پاسخ را بنویسید.'
        : 'دسترسی به میکروفون داده نشد. اجازهٔ میکروفون را بدهید یا پاسخ را بنویسید.';
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
      if (blob.size === 0) { audioStatus.textContent = 'صدایی ضبط نشد.'; return; }
      if (blob.size > 2 * 1024 * 1024) { audioStatus.textContent = 'ضبط بیش از حد بزرگ است؛ کوتاه‌تر ضبط کنید.'; return; }
      audioStatus.textContent = 'در حال تبدیل صدا به متن…';
      const data = await blobToBase64(blob);
      const res = await postJson('/api/ai/transcribe', { mimeType: type, data }, { timeoutMs: 60000 });
      if (res.ok && res.data?.text) {
        answer.value = [answer.value.trim(), res.data.text.trim()].filter(Boolean).join(' ').slice(0, ANSWER_MAX);
        audioStatus.textContent = 'متن ضبط‌شده در کادر آمد. بررسی کنید و سپس ثبت کنید.';
      } else {
        audioStatus.textContent = `${errorText(res.data?.error || 'AI_UNAVAILABLE')} می‌توانید پاسخ را بنویسید.`;
      }
    };
    recorder.start();
    micBtn.textContent = 'توقف ضبط';
    audioStatus.textContent = 'در حال ضبط… (حداکثر ۹۰ ثانیه)';
    recordTimer = setTimeout(() => recorder && recorder.stop(), MAX_RECORD_MS);
  });

  async function finish() {
    finished = true;
    setBanner('ختم رسیدگی. گزارش ارزیابی آماده می‌شود.');
    renderSteps();
    renderInput(false);
    setBusy(true);
    const userLines = history.filter((m) => m.speaker === userSide).length;
    if (userLines < 1) {
      report.replaceChildren(notice('هنوز پاسخی از طرف شما ثبت نشده است؛ گزارش ساخته نشد.'));
      setBusy(false);
      return;
    }
    const res = await postJson('/api/ai/moot/evaluate', { caseId: CASE_ID, history: historyForApi(history) }, { timeoutMs: 60000 });
    if (!res.ok || !res.data?.report) {
      report.replaceChildren(notice(`${errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE'))} گزارش ساخته نشد.`));
      setBusy(false);
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
    setBanner('گزارش آماده است.');
    setBusy(false);
  }

  renderSteps();
  // شروع خودکار: اولین نوبت منشی.
  runCurrent();

  return h('div', { class: 'hearing' }, [
    h('p', { class: 'hearing-role muted', text: `شما: ${SIDE_OPTIONS.find(([v]) => v === userSide)?.[1] || ''} — سطح: ${DIFFICULTY_OPTIONS.find(([v]) => v === difficulty)?.[1] || ''}` }),
    banner,
    stepList,
    log,
    audioStatus,
    controls,
    inputArea,
    h('div', { class: 'row' }, [nextBtn]),
    report,
    h('div', { class: 'row' }, [restartBtn]),
    h('p', { class: 'muted', text: 'این جلسهٔ آموزشی است و جایگزین مشاورهٔ حقوقی نیست.' }),
  ]);
}

/** پیش از ورود به جلسه: انتخاب طرف، سطح، و صدا. */
export function hearingSetup(onStart) {
  const side = h('select', { 'aria-label': 'طرفی که بازی می‌کنید' }, SIDE_OPTIONS.map(([v, t]) => h('option', { value: v, text: t })));
  const diff = h('select', { 'aria-label': 'سطح دشواری' }, DIFFICULTY_OPTIONS.map(([v, t]) => h('option', { value: v, text: t })));
  diff.value = 'intermediate';
  const speech = h('input', { type: 'checkbox', checked: '' });
  const speed = h('select', { 'aria-label': 'سرعت پیش‌فرض صدا' }, SPEED_OPTIONS.map(([v, t]) => h('option', { value: String(v), text: t })));
  speed.value = '1';
  const start = h('button', { class: 'btn', type: 'button', text: 'ورود به جلسه' });
  start.addEventListener('click', () => onStart({ side: side.value, difficulty: diff.value, speechOn: speech.checked, initialRate: Number(speed.value) }));
  return h('div', { class: 'hearing-setup' }, [
    h('p', { text: 'شما یکی از دو طرف دعوا را بازی می‌کنید. منشی و قاضی و طرف مقابل توسط هوش مصنوعی اجرا می‌شوند.' }),
    h('label', {}, [document.createTextNode('طرف شما: '), side]),
    h('label', {}, [document.createTextNode('سطح: '), diff]),
    h('label', {}, [speech, document.createTextNode(' پخش صدای بازیگران')]),
    h('label', {}, [document.createTextNode('سرعت صدا: '), speed]),
    h('div', { class: 'row' }, [start]),
  ]);
}

/** بخش دفاع شفاهی صفحهٔ موت‌کورت. */
export function oralDefenseSection() {
  const box = h('div', { class: 'oral-defense-wrap' }, [h('p', { class: 'muted', text: 'در حال بررسی امکان جلسهٔ دادگاه…' })]);
  (async () => {
    const [status, me] = await Promise.all([aiStatus(), getJson('/api/me')]);
    const children = [h('h2', { text: 'جلسهٔ شبیه‌سازی دادگاه' })];
    if (!me.ok) {
      children.push(notice('برای جلسهٔ دادگاه با هوش مصنوعی ابتدا وارد حساب خود شوید. تا آن زمان حالت آموزشی قاعده‌محور در دسترس است.'));
      box.replaceChildren(...children, oralDefensePanel());
      return;
    }
    if (!status.configured) {
      children.push(notice('سرویس هوش مصنوعی هنوز روی سرور فعال نشده است؛ حالت آموزشی قاعده‌محور در دسترس است.'));
      box.replaceChildren(...children, oralDefensePanel());
      return;
    }
    children.push(h('p', { class: 'muted', text: 'پرسش‌ها و پاسخ‌ها بر اساس گفت‌وگوی شما ساخته می‌شوند. فایل صوتی شما فقط برای تبدیل به متن فرستاده می‌شود و صدای بازیگران در مرورگر پخش می‌شود.' }));
    const body = h('div', {});
    const showSetup = () => body.replaceChildren(hearingSetup((opts) => body.replaceChildren(hearingSession(opts))));
    showSetup();
    children.push(body);
    box.replaceChildren(...children);
  })();
  return box;
}
