// اتاق دادگاه با هوش مصنوعی: منشی، قاضی، وکیل خواهان و وکیل خوانده؛ کاربر یکی از دو طرف را بازی می‌کند.
// منشی متن ثابت دارد؛ قاضی و طرف مقابل از سرور (Gemini) پاسخ می‌گیرند. صدا با TTS و ورودی با تبدیل گفتار به متن.
// فقط برای کاربر واردشده و وقتی سرویس روی سرور فعال است کار می‌کند؛ در غیر این صورت حالت قاعده‌محور نشان داده می‌شود.
import { h } from './dom.js';
import { getJson, postJson } from './api.js';
import { aiStatus, errorText, postForBlob, createPlayer, blobToBase64, pickRecordingMime, baseMime } from './ai-client.js';
import { oralDefensePanel } from './moot-oral.js';

export const CASE_SLUG_RE = /^[a-z0-9-]{3,64}$/;
export const MAX_RECORD_MS = 90 * 1000;
export const ANSWER_MAX = 1500;
const HISTORY_ITEMS = 30;
const HISTORY_CHARS = 24000;

export const SIDE_OPTIONS = [['plaintiff', 'وکیل خواهان (شرکت ب)'], ['defendant', 'وکیل خوانده (آقای الف)']];
export const DIFFICULTY_OPTIONS = [['beginner', 'مبتدی'], ['intermediate', 'متوسط'], ['advanced', 'پیشرفته']];
export const PLAY_FAILURE_TEXT = Object.freeze({
  NOT_ALLOWED: 'مرورگر پخش خودکار را مسدود کرد. روی «تکرار» بزنید.',
  ABORTED: 'پخش متوقف شد. برای شنیدن دوباره روی «تکرار» بزنید.',
  PLAY_FAILED: 'پخش صدا شروع نشد. روی «تکرار» بزنید.',
});
export const playFailureText = (error) => PLAY_FAILURE_TEXT[error] || PLAY_FAILURE_TEXT.PLAY_FAILED;
export const SPEED_OPTIONS = [[0.75, '۰٫۷۵×'], [1, '۱×'], [1.25, '۱٫۲۵×'], [1.5, '۱٫۵×']];

export const SPEAKER_LABEL = Object.freeze({ clerk: 'منشی دادگاه', judge: 'قاضی', plaintiff: 'وکیل خواهان', defendant: 'وکیل خوانده' });
export const VOICE_FOR = Object.freeze({ clerk: 'Leda', judge: 'Charon', plaintiff: 'Puck', defendant: 'Kore' });

/** دوازده مرحلهٔ رسیدگی که به کاربر نشان داده می‌شوند. */
export const GROUP_LABELS = Object.freeze([
  'افتتاح جلسه', 'اعلام موضوع دعوا', 'طرح ادعای خواهان', 'دفاعیات خوانده',
  'پرسش‌های قاضی از خواهان', 'پرسش‌های قاضی از خوانده', 'ارائه و بررسی مستندات', 'پاسخ متقابل طرفین',
  'دفاع نهایی', 'ختم رسیدگی', 'صدور رأی آموزشی', 'ارزیابی عملکرد',
]);

/**
 * گام‌های گفت‌وگو به ترتیب. group شمارهٔ مرحلهٔ نمایشی است؛ speaker گوینده؛ اگر گوینده طرف کاربر باشد، کاربر پاسخ می‌دهد.
 */
export function hearingScript(subject = '') {
  return [
    { id: 'open', group: 1, speaker: 'clerk', text: 'جلسه تشکیل می‌شود. لطفاً همگی آماده باشند. دادرسی به‌صورت آموزشی و بر اساس پروندهٔ فرضی برگزار می‌شود.' },
    { id: 'subject', group: 2, speaker: 'clerk', text: `موضوع دعوا: ${subject}.` },
    { id: 'claim', group: 3, speaker: 'plaintiff', stage: 'claim' },
    { id: 'defense', group: 4, speaker: 'defendant', stage: 'defense' },
    { id: 'q_plaintiff', group: 5, speaker: 'judge', stage: 'judge_question_plaintiff' },
    { id: 'a_plaintiff', group: 5, speaker: 'plaintiff', stage: 'judge_question_plaintiff' },
    { id: 'q_defendant', group: 6, speaker: 'judge', stage: 'judge_question_defendant' },
    { id: 'a_defendant', group: 6, speaker: 'defendant', stage: 'judge_question_defendant' },
    { id: 'docs', group: 7, speaker: 'plaintiff', stage: 'documents' },
    { id: 'rebut_p', group: 8, speaker: 'plaintiff', stage: 'rebuttal_plaintiff' },
    { id: 'rebut_d', group: 8, speaker: 'defendant', stage: 'rebuttal_defendant' },
    { id: 'final_p', group: 9, speaker: 'plaintiff', stage: 'final_plaintiff' },
    { id: 'final_d', group: 9, speaker: 'defendant', stage: 'final_defendant' },
    { id: 'close', group: 10, speaker: 'clerk', text: 'ختم رسیدگی اعلام می‌شود. جمع‌بندی آموزشی قاضی آماده می‌شود.' },
    { id: 'verdict', group: 11, speaker: 'judge', stage: 'verdict' },
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

function timeNow() {
  return new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });
}

export function hearingSession({ caseId, caseDetail, side, difficulty, speechOn, initialRate = 1, initialVolume = 1, userName = '' }) {
  const script = hearingScript(caseDetail.subject);
  const caseTitle = caseDetail.title;
  const parties = caseDetail.parties;
  const userSide = side;
  let activeSpeaker = null;
  const player = createPlayer({
    onEnded: () => { activeSpeaker = null; renderSeats(); },
  });
  const history = [];
  let index = 0;
  let busy = false;
  let finished = false;
  let completionSent = false;
  let recorder = null;
  let recordTimer = null;
  let chunks = [];
  let lastBlob = null;
  let lastText = '';
  let lastSpeaker = null;

  player.setRate(initialRate);
  player.setVolume(initialVolume);
  // این تابع هنوز در همان لمس «ورود به اتاق دادگاه» اجرا می‌شود؛ بدون آن iOS اولین صدای منشی را مسدود می‌کند.
  player.unlock();

  // ---- عناصر ----
  const banner = h('p', { class: 'court-banner', role: 'status', 'aria-live': 'polite' });
  const stageList = h('ol', { class: 'court-stages', 'aria-label': 'مراحل رسیدگی' });
  const seats = h('div', { class: 'court-seats', 'aria-label': 'شرکت‌کنندگان جلسه' });
  const log = h('ol', { class: 'court-log', 'aria-label': 'متن مذاکرات', 'aria-live': 'polite' });
  const report = h('div', { class: 'court-report', role: 'region', 'aria-live': 'polite' });
  const inputArea = h('div', { class: 'court-input' });
  const answer = h('textarea', { rows: '3', maxlength: String(ANSWER_MAX), id: 'court-answer', 'aria-label': 'پاسخ شما در دادگاه', placeholder: 'پاسخ خود را بنویسید یا با میکروفون بگویید…' });
  const micBtn = h('button', { class: 'court-mic', type: 'button', 'aria-label': 'ضبط صدا', text: '🎙 ضبط صدا' });
  const submitBtn = h('button', { class: 'btn', type: 'button', text: 'ارسال پاسخ' });
  const audioStatus = h('p', { class: 'court-audio-status', role: 'status', 'aria-live': 'polite', text: 'آماده' });
  const nextBtn = h('button', { class: 'btn court-next', type: 'button', text: 'ادامه', disabled: '' });
  const stopBtn = h('button', { class: 'btn secondary', type: 'button', text: '■ توقف', 'aria-label': 'توقف صدا' });
  const replayBtn = h('button', { class: 'btn secondary', type: 'button', text: '↻ تکرار', 'aria-label': 'تکرار آخرین صدا', disabled: '' });
  const speedSelect = h('select', { class: 'court-speed', 'aria-label': 'سرعت صدا' }, SPEED_OPTIONS.map(([v, t]) => h('option', { value: String(v), text: t })));
  speedSelect.value = String(initialRate);
  const volume = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(initialVolume), class: 'court-volume', 'aria-label': 'حجم صدا' });
  if (!player.volumeSupported) {
    volume.disabled = true;
    volume.title = 'در این دستگاه حجم صدا را با دکمه‌های کنار دستگاه تنظیم کنید.';
  }
  const speakToggle = h('input', { type: 'checkbox' });
  if (speechOn) speakToggle.checked = true;
  const micSupported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
  if (!micSupported) { micBtn.disabled = true; micBtn.textContent = '🎙 میکروفون در دسترس نیست'; }
  const micIndicator = h('span', { class: 'court-mic-state', text: micSupported ? 'میکروفون آماده' : 'میکروفون ندارد' });

  // تب‌ها
  const tabTranscript = h('button', { class: 'court-tab', type: 'button', role: 'tab', 'aria-selected': 'true', text: 'مکالمه' });
  const tabReport = h('button', { class: 'court-tab', type: 'button', role: 'tab', 'aria-selected': 'false', text: 'ارزیابی عملکرد' });
  const tabList = h('div', { class: 'court-tabs', role: 'tablist', 'aria-label': 'بخش‌های جلسه' }, [tabTranscript, tabReport]);
  const transcriptPanel = h('section', { class: 'court-panel', role: 'tabpanel' }, [log]);
  const reportPanel = h('section', { class: 'court-panel', role: 'tabpanel', hidden: '' }, [report]);
  function showTab(which) {
    const isReport = which === 'report';
    tabTranscript.setAttribute('aria-selected', String(!isReport));
    tabReport.setAttribute('aria-selected', String(isReport));
    transcriptPanel.hidden = isReport;
    reportPanel.hidden = !isReport;
  }
  tabTranscript.addEventListener('click', () => showTab('transcript'));
  tabReport.addEventListener('click', () => showTab('report'));

  // ---- نمایش ----
  function currentStep() { return script[index]; }
  function userTurn() { const s = currentStep(); return Boolean(s && s.speaker === userSide); }
  function currentGroup() { const s = currentStep(); return s ? s.group : 12; }

  function renderStages() {
    const cur = currentGroup();
    const states = stepStates(GROUP_LABELS.length, cur - 1);
    stageList.replaceChildren(...GROUP_LABELS.map((label, i) => h('li', {
      class: `court-stage ${states[i]}`,
      ...(states[i] === 'current' ? { 'aria-current': 'step' } : {}),
    }, [
      h('span', { class: 'court-stage-num', 'aria-hidden': 'true', text: String(i + 1) }),
      h('span', { text: label }),
    ])));
  }

  function seatCard(key, name, roleText) {
    const speaking = activeSpeaker === key;
    const isUser = key === userSide;
    const status = isUser ? 'شما' : (speaking ? 'در حال صحبت' : 'منتظر');
    return h('div', { class: `court-seat ${speaking ? 'speaking' : ''} ${isUser ? 'you' : ''}`, 'data-seat': key }, [
      h('span', { class: 'court-avatar', 'aria-hidden': 'true', text: name.slice(0, 1) }),
      h('strong', { text: roleText }),
      h('small', { text: name }),
      h('span', { class: 'court-pill', text: status }),
    ]);
  }

  function renderSeats() {
    seats.replaceChildren(
      seatCard('judge', 'قاضی هوشمند', 'قاضی'),
      h('div', { class: 'court-seat-row' }, [
        seatCard('plaintiff', 'وکیل خواهان', 'وکیل خواهان'),
        seatCard('defendant', 'وکیل خوانده', 'وکیل خوانده'),
      ]),
      seatCard('clerk', 'منشی دادگاه', 'منشی'),
    );
  }

  function renderLog() {
    log.replaceChildren(...history.map((m, i) => {
      const playable = Boolean(m.blob);
      return h('li', { class: `court-line ${m.speaker}` }, [
        h('div', { class: 'court-line-head' }, [
          h('strong', { text: `${SPEAKER_LABEL[m.speaker] || 'شما'}` }),
          h('time', { text: m.at || '' }),
          playable ? h('button', { class: 'court-line-play', type: 'button', 'aria-label': `پخش گفتهٔ ${SPEAKER_LABEL[m.speaker] || ''}`, text: '▶', 'data-index': String(i) }) : null,
        ].filter(Boolean)),
        h('p', { class: 'pre-wrap', text: m.text }),
      ]);
    }));
    log.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }

  function renderInput(show) {
    inputArea.replaceChildren();
    if (!show) return;
    inputArea.append(
      h('label', { class: 'visually-hidden', for: 'court-answer', text: 'پاسخ شما' }),
      answer,
      h('div', { class: 'court-input-row' }, [micBtn, micIndicator, submitBtn]),
    );
    answer.disabled = busy;
    submitBtn.disabled = busy;
    micBtn.disabled = busy || !micSupported;
  }

  function setBanner(text) { banner.textContent = text; }

  function setBusy(on) {
    busy = on;
    replayBtn.disabled = on || !lastText;
    nextBtn.disabled = on || userTurn() || finished;
    submitBtn.disabled = on;
  }

  // ---- صدا ----
  async function speak(text, speaker, item) {
    if (!speakToggle.checked) { audioStatus.textContent = 'پخش صدا خاموش است.'; return; }
    audioStatus.textContent = 'در حال تولید صدا…';
    const res = await postForBlob('/api/ai/speech', { text, voice: VOICE_FOR[speaker] || 'Kore' }, { timeoutMs: 40000 });
    if (!res.ok) {
      audioStatus.textContent = `${errorText(res.error)} متن را بخوانید و ادامه دهید.`;
      return;
    }
    if (item) item.blob = res.blob;
    lastBlob = res.blob;
    activeSpeaker = speaker;
    renderSeats();
    const played = await player.play(res.blob);
    if (played.ok) {
      audioStatus.textContent = 'در حال پخش. با «توقف» قطع کنید.';
    } else {
      activeSpeaker = null;
      renderSeats();
      audioStatus.textContent = playFailureText(played.error);
    }
    renderLog();
  }

  // ---- گام‌ها ----
  function addLine(speaker, text, fromUser = false) {
    const item = { role: fromUser ? 'user' : 'ai', speaker, text, at: timeNow() };
    history.push(item);
    lastText = text;
    lastSpeaker = speaker;
    renderLog();
    return item;
  }

  function refresh() {
    renderStages();
    renderSeats();
  }

  async function runCurrent() {
    refresh();
    renderInput(false);
    const step = currentStep();
    if (!step) return finish();
    if (step.speaker === 'clerk') {
      setBanner(`${SPEAKER_LABEL.clerk}: ${GROUP_LABELS[step.group - 1]}`);
      const item = addLine('clerk', step.text);
      await speak(step.text, 'clerk', item);
      setBusy(false);
      nextBtn.disabled = false;
      return;
    }
    if (userTurn()) {
      setBanner(`نوبت شماست — ${SPEAKER_LABEL[step.speaker]}: ${GROUP_LABELS[step.group - 1]}`);
      renderInput(true);
      setBusy(false);
      answer.focus?.();
      return;
    }
    setBanner(`${SPEAKER_LABEL[step.speaker]} در حال پاسخ… (${GROUP_LABELS[step.group - 1]})`);
    setBusy(true);
    const res = await postJson('/api/ai/moot/turn', {
      caseId, role: step.speaker, stage: step.stage, difficulty, history: historyForApi(history),
    }, { timeoutMs: 45000 });
    if (!res.ok || !res.data?.reply) {
      setBanner(`${errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE'))} برای ادامه دوباره تلاش کنید.`);
      setBusy(false);
      nextBtn.disabled = false;
      nextBtn.textContent = 'تلاش دوباره';
      return;
    }
    nextBtn.textContent = 'ادامه';
    const item = addLine(step.speaker, res.data.reply);
    await speak(res.data.reply, step.speaker, item);
    setBusy(false);
    nextBtn.disabled = false;
  }

  function advance() {
    index += 1;
    lastBlob = null;
    runCurrent();
  }

  async function finish() {
    finished = true;
    setBanner('ختم رسیدگی و جمع‌بندی آموزشی انجام شد. گزارش ارزیابی آماده می‌شود.');
    refresh();
    renderInput(false);
    setBusy(true);
    showTab('report');
    const userLines = history.filter((m) => m.speaker === userSide).length;
    if (userLines < 1) {
      report.replaceChildren(notice('هنوز پاسخی از طرف شما ثبت نشده است؛ گزارش ساخته نشد.'));
      setBusy(false);
      return;
    }
    await evaluate();
  }

  /** گزارش را می‌سازد. در صورت خطا دکمهٔ تلاش دوباره می‌گذارد و جلسه را «تکمیل‌شده» ثبت نمی‌کند. */
  async function evaluate() {
    setBusy(true);
    report.replaceChildren(h('p', { class: 'muted', text: 'گزارش در حال ساختن است…' }));
    const res = await postJson('/api/ai/moot/evaluate', { caseId, history: historyForApi(history) }, { timeoutMs: 60000 });
    if (!res.ok || !res.data?.report) {
      const retry = h('button', { class: 'btn secondary', type: 'button', text: 'تلاش دوباره برای ساخت گزارش' });
      retry.addEventListener('click', evaluate);
      report.replaceChildren(
        notice(`${errorText(res.data?.error || (res.networkError ? 'NETWORK' : 'AI_UNAVAILABLE'))} گزارش ساخته نشد.`),
        h('p', {}, [retry]),
      );
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
    setBanner('گزارش ارزیابی آماده است.');
    setBusy(false);
    await recordCompletion();
  }

  async function recordCompletion() {
    if (completionSent) return;
    const done = await postJson(`/api/moot/cases/${encodeURIComponent(caseId)}/complete`, {});
    if (done.ok) {
      completionSent = true;
      return;
    }
    report.append(h('p', { class: 'muted', text: 'گزارش آماده است، اما ثبت تکمیل جلسه در سوابق شما انجام نشد.' }));
  }

  // ---- رویدادها ----
  nextBtn.addEventListener('click', () => {
    if (nextBtn.textContent === 'تلاش دوباره') { nextBtn.textContent = 'ادامه'; player.unlock(); runCurrent(); return; }
    player.stop();
    player.unlock();
    activeSpeaker = null;
    advance();
  });

  submitBtn.addEventListener('click', () => {
    const v = validAnswer(answer.value);
    if (!v.ok) { audioStatus.textContent = v.error; return; }
    player.stop();
    player.unlock();
    addLine(userSide, v.text, true);
    answer.value = '';
    renderInput(false);
    advance();
  });

  log.addEventListener('click', async (event) => {
    const btn = event.target.closest?.('.court-line-play');
    if (!btn) return;
    const item = history[Number(btn.dataset.index)];
    if (!item?.blob) return;
    const played = await player.play(item.blob);
    audioStatus.textContent = played.ok ? 'در حال پخش…' : playFailureText(played.error);
  });

  replayBtn.addEventListener('click', async () => {
    if (lastBlob) {
      const played = await player.play(lastBlob);
      audioStatus.textContent = played.ok ? 'در حال پخش…' : playFailureText(played.error);
      return;
    }
    player.unlock();
    if (lastText && lastSpeaker) await speak(lastText, lastSpeaker);
  });

  stopBtn.addEventListener('click', () => { player.stop(); activeSpeaker = null; renderSeats(); audioStatus.textContent = 'صدا متوقف شد.'; });
  speedSelect.addEventListener('change', () => { player.setRate(Number(speedSelect.value)); });
  volume.addEventListener('input', () => { player.setVolume(Number(volume.value)); });

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
      micBtn.textContent = '🎙 ضبط صدا';
      micBtn.classList.remove('recording');
      micIndicator.textContent = 'میکروفون آماده';
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) { audioStatus.textContent = 'صدایی ضبط نشد.'; return; }
      if (blob.size > 2 * 1024 * 1024) { audioStatus.textContent = 'ضبط بیش از حد بزرگ است؛ کوتاه‌تر ضبط کنید.'; return; }
      audioStatus.textContent = 'در حال تبدیل صدا به متن…';
      const data = await blobToBase64(blob);
      const res = await postJson('/api/ai/transcribe', { mimeType: type, data }, { timeoutMs: 60000 });
      if (res.ok && res.data?.text) {
        answer.value = [answer.value.trim(), res.data.text.trim()].filter(Boolean).join(' ').slice(0, ANSWER_MAX);
        audioStatus.textContent = 'متن ضبط‌شده در کادر آمد. بررسی کنید و سپس ارسال کنید.';
      } else {
        audioStatus.textContent = `${errorText(res.data?.error || 'AI_UNAVAILABLE')} می‌توانید پاسخ را بنویسید.`;
      }
    };
    recorder.start();
    micBtn.textContent = '■ توقف ضبط';
    micBtn.classList.add('recording');
    micIndicator.textContent = 'در حال ضبط… (حداکثر ۹۰ ثانیه)';
    recordTimer = setTimeout(() => recorder && recorder.stop(), MAX_RECORD_MS);
  });

  // ---- شروع ----
  renderStages();
  renderSeats();
  runCurrent();

  const caseCard = h('section', { class: 'court-side-card', 'aria-labelledby': 'court-case-title' }, [
    h('h2', { id: 'court-case-title', text: 'اطلاعات پرونده' }),
    h('p', { class: 'court-case-name', text: caseTitle }),
    h('dl', { class: 'court-facts' }, [
      h('dt', { text: 'موضوع دعوا' }), h('dd', { text: caseDetail.subject }),
      h('dt', { text: 'خواهان' }), h('dd', { text: parties.plaintiff }),
      h('dt', { text: 'خوانده' }), h('dd', { text: parties.defendant }),
    ]),
    h('p', { class: 'muted court-note', text: 'اطلاعات این پرونده از بانک پرونده‌های منتشرشدهٔ وفاق خوانده شده است.' }),
  ]);
  const stageCard = h('section', { class: 'court-side-card', 'aria-label': 'مراحل رسیدگی' }, [h('h2', { text: 'مراحل رسیدگی' }), stageList]);
  const userCard = h('section', { class: 'court-side-card', 'aria-label': 'نقش شما' }, [
    h('h2', { text: 'نقش شما' }),
    h('p', { text: `${userName ? `${userName} — ` : ''}${SIDE_OPTIONS.find(([v]) => v === userSide)?.[1] || ''}` }),
    h('p', { class: 'muted', text: `سطح: ${DIFFICULTY_OPTIONS.find(([v]) => v === difficulty)?.[1] || ''}` }),
  ]);
  showTab('transcript');

  return h('div', { class: 'court' }, [
    h('aside', { class: 'court-side' }, [caseCard, stageCard, userCard]),
    h('div', { class: 'court-main' }, [
      banner,
      seats,
      tabList,
      transcriptPanel,
      reportPanel,
      inputArea,
    ]),
    h('footer', { class: 'court-audio', 'aria-label': 'کنترل صدا' }, [
      h('div', { class: 'court-audio-info' }, [h('span', { class: 'court-audio-label', text: 'وضعیت صدا' }), audioStatus, micIndicator]),
      h('div', { class: 'court-audio-controls' }, [
        replayBtn, stopBtn, speedSelect,
        h('label', { class: 'court-volume-wrap' }, [h('span', { text: 'حجم' }), volume]),
        h('label', { class: 'court-toggle' }, [speakToggle, document.createTextNode(' پخش خودکار')]),
        nextBtn,
      ]),
    ]),
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
  const start = h('button', { class: 'btn', type: 'button', text: 'ورود به اتاق دادگاه' });
  start.addEventListener('click', () => onStart({ side: side.value, difficulty: diff.value, speechOn: speech.checked, initialRate: Number(speed.value) }));
  return h('div', { class: 'hearing-setup' }, [
    h('p', { text: 'شما یکی از دو طرف دعوا را بازی می‌کنید. منشی، قاضی و طرف مقابل توسط هوش مصنوعی اجرا می‌شوند.' }),
    h('label', {}, [document.createTextNode('طرف شما: '), side]),
    h('label', {}, [document.createTextNode('سطح: '), diff]),
    h('label', {}, [speech, document.createTextNode(' پخش صدای بازیگران')]),
    h('label', {}, [document.createTextNode('سرعت صدا: '), speed]),
    h('div', { class: 'row' }, [start]),
  ]);
}

/** صفحهٔ کامل اتاق دادگاه. */
// اتاق دادگاه فقط پروندهٔ منتشرشدهٔ انتخاب‌شده را اجرا می‌کند؛ شناسه از نشانی (?case=) خوانده می‌شود.
export function courtRoomPage(params = {}) {
  const body = h('div', { class: 'court-page' });
  const topbar = h('header', { class: 'court-topbar' }, [
    h('a', { class: 'court-back', href: '#/academy', text: '→ بازگشت به آکادمی' }),
    h('div', { class: 'court-title' }, [h('strong', { text: 'موت‌کورت هوشمند' }), h('small', { text: 'اتاق دادگاه · پروندهٔ آموزشی' })]),
    h('span', { class: 'court-ai-state', id: 'court-ai-state', text: 'بررسی سرویس…' }),
  ]);
  body.append(topbar, h('p', { class: 'muted', role: 'status', text: 'در حال بررسی امکان ورود به جلسه…' }));
  (async () => {
    const [me, status] = await Promise.all([getJson('/api/me'), aiStatus()]);
    const userName = me.ok ? (me.data?.user?.displayName || me.data?.user?.email || '') : '';
    const aiState = body.querySelector('#court-ai-state');
    if (aiState) aiState.textContent = status.configured ? 'هوش مصنوعی: متصل' : 'هوش مصنوعی: غیرفعال';
    const children = [];
    if (!me.ok) {
      children.push(notice('برای ورود به اتاق دادگاه ابتدا وارد حساب خود شوید.'));
      children.push(h('p', {}, [h('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })]));
    } else if (!status.configured) {
      children.push(notice('سرویس هوش مصنوعی هنوز روی سرور فعال نشده است. اتاق دادگاه در دسترس نیست.'));
      children.push(h('p', {}, [h('a', { href: '#/moot-court', text: 'بازگشت به موت‌کورت' })]));
    } else if (!CASE_SLUG_RE.test(params.case || '')) {
      children.push(notice('پروندهٔ آموزشی انتخاب نشده است.'));
      children.push(h('p', {}, [h('a', { class: 'btn', href: '#/moot-court/cases', text: 'انتخاب پرونده' })]));
    } else {
      const detail = await getJson(`/api/moot/cases/${encodeURIComponent(params.case)}`);
      if (!detail.ok || !detail.data?.case) {
        children.push(notice('این پرونده در دسترس نیست یا هنوز منتشر نشده است.'));
        children.push(h('p', {}, [h('a', { href: '#/moot-court/cases', text: 'انتخاب پرونده دیگر' })]));
      } else {
        const caseDetail = detail.data.case;
        const holder = h('div', { class: 'court-holder' });
        holder.append(hearingSetup((opts) => {
          holder.classList.add('in-session');
          holder.replaceChildren(hearingSession({ ...opts, caseId: caseDetail.id, caseDetail, userName }));
        }));
        children.push(holder);
      }
    }
    body.replaceChildren(topbar, ...children);
  })();
  return body;
}

/** بخش دفاع شفاهی صفحهٔ موت‌کورت: ورود به اتاق دادگاه یا حالت آموزشی قاعده‌محور. */
export function oralDefenseSection() {
  const box = h('div', { class: 'oral-defense-wrap' }, [h('p', { class: 'muted', text: 'در حال بررسی امکان جلسهٔ دادگاه…' })]);
  (async () => {
    const [status, me] = await Promise.all([aiStatus(), getJson('/api/me')]);
    const children = [h('h2', { text: 'جلسهٔ شبیه‌سازی دادگاه' })];
    if (me.ok && status.configured) {
      children.push(
        h('p', { class: 'muted', text: 'در اتاق دادگاه، قاضی و وکیل طرف مقابل و منشی با صدا با شما گفت‌وگو می‌کنند.' }),
        h('p', {}, [h('a', { class: 'btn', href: '#/moot-court/cases', text: 'انتخاب پرونده و ورود به اتاق دادگاه' })]),
      );
      box.replaceChildren(...children);
      return;
    }
    children.push(notice(me.ok
      ? 'سرویس هوش مصنوعی هنوز روی سرور فعال نشده است؛ حالت آموزشی قاعده‌محور در دسترس است.'
      : 'برای جلسهٔ دادگاه با هوش مصنوعی ابتدا وارد حساب خود شوید. تا آن زمان حالت آموزشی قاعده‌محور در دسترس است.'));
    box.replaceChildren(...children, oralDefensePanel());
  })();
  return box;
}
