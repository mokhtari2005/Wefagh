// موت‌کورت آموزشی با ذخیرهٔ اختیاری محلی و ذخیرهٔ پایدار برای کاربران واردشده.
import { h } from './dom.js';
import { getJson, postJson, sendJson } from './api.js';
import { COACH_ROLES, getCoachPrompt, evaluateOralAnswer } from './moot-coach.js';

/** نوع فایل ضبط را از بایت‌های ابتدایی تشخیص می‌دهد (WebM، MP4/M4A، Ogg). */
async function detectAudioType(blob, fallback) {
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const tag = String.fromCharCode(...head.slice(4, 8));
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'audio/webm';
    if (tag === 'ftyp') return 'audio/mp4';
    if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return 'audio/ogg';
  } catch {
    // نوع از روی mimeType ادامه می‌یابد.
  }
  return String(fallback || '').split(';')[0];
}

function extensionFor(type) {
  if (type.includes('mp4')) return '.m4a';
  if (type.includes('ogg')) return '.ogg';
  return '.webm';
}

export const CASE = Object.freeze({
  id: 'contract-delivery-delay',
  title: 'پروندهٔ فرضی: تأخیر در تحویل کالا',
  facts: [
    'آقای «الف» (فروشنده) و شرکت «ب» (خریدار) قراردادی برای خرید ۱۰۰ دستگاه دربارهٔ تاریخ معین تحویل امضا کردند.',
    'تحویل کالا با ۴۰ روز تأخیر انجام شد. خریدار دعوای مطالبهٔ خسارت تأخیر و فسخ جزئی قرارداد را طرح کرده است.',
    'فروشنده ادعا می‌کند تأخیر ناشی از اعتصاب سراسری حمل‌ونقل بوده که پیش از امضای قرارداد اعلام شده بود.',
    'در قرارداد بندی دربارهٔ حوادث غیرمترقبه و نحوهٔ اعلام آن وجود دارد، ولی شرط خسارت تأخیر به‌صورت مبلغ ثابت تعیین نشده است.',
  ],
  issues: [
    { id: 'i1', text: 'آیا تأخیر در تحویل محرز است و چه کسی باید آن را اثبات کند؟' },
    { id: 'i2', text: 'آیا اعتصاب حمل‌ونقل می‌تواند عذر موجه باشد؛ و آیا فروشنده آن را به‌موقع اعلام کرده است؟' },
    { id: 'i3', text: 'اگر خسارت تعلق بگیرد، مبنای محاسبه و میزان آن بر چه اساسی باید تعیین شود؟' },
  ],
  rubric: [
    'هر مسئله را جداگانه و با قاعدهٔ حقوقی مربوط بررسی کرده‌ام.',
    'واقعیت‌ها را فقط از متن پرونده آورده‌ام و چیزی را حدس نزده‌ام.',
    'استدلال طرف مقابل را خلاصه و به آن پاسخ داده‌ام.',
    'هر استناد را فقط با عنوان دقیق منبع و شماره (در صورت وجود) آورده‌ام.',
    'درخواست نهایی من برای دادگاه روشن و قابل اجراست.',
    'نتیجه‌گیری‌ام را به‌صورت «اگر ... آنگاه ...» و با احتمال‌های دیگر سنجیده‌ام.',
  ],
  outlineHint: 'ساختار پیشنهادی: ۱) خلاصهٔ وقایع با ارجاع به متن پرونده؛ ۲) برای هر مسئله: قاعده، واقعه، نتیجه؛ ۳) پاسخ به دفاع طرف مقابل؛ ۴) درخواست نهایی. ارزیابی نهایی با وکیل یا استاد است.',
});

export function scoreRubric(checked, total) {
  if (!total) return 0;
  return Math.round((checked / total) * 100);
}

const STAGES = [
  { id: 'facts', title: 'وقایع و مسائل' },
  { id: 'answers', title: 'تنظیم پاسخ' },
  { id: 'check', title: 'خودارزیابی' },
  { id: 'result', title: 'نتیجه' },
];

export function mootCourtPage() {
  const wrap = h('div', { class: 'moot' }, [
    h('span', { class: 'section-kicker', text: 'تمرین دادرسی · پروندهٔ فرضی آموزشی' }),
    h('h1', { text: 'موت‌کورت' }),
    h('p', { class: 'lead', text: 'یک پروندهٔ فرضی را مرحله‌به‌مرحله تحلیل کنید و در صورت ورود به حساب، تمرین را ذخیره کنید و بعداً ادامه دهید.' }),
  ]);
  const accountBar = h('section', { class: 'case-panel', 'aria-label': 'ذخیره و بازیابی تمرین' }, [h('h2', { text: 'تمرین‌های من' })]);
  const accountStatus = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite', text: 'در حال بررسی وضعیت حساب…' });
  const sessionSelect = h('select', { 'aria-label': 'انتخاب تمرین ذخیره‌شده' });
  const newSession = h('button', { class: 'btn', type: 'button', text: 'شروع تمرین ذخیره‌شونده' });
  const saveStatus = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite', text: 'هنوز تمرینی انتخاب نشده است.' });
  accountBar.append(accountStatus, h('div', { class: 'row' }, [sessionSelect, newSession]), saveStatus);
  wrap.append(accountBar, h('div', { class: 'notice', role: 'note', text: 'این تمرین فرضی و آموزشی است و جایگزین مشاورهٔ حقوقی نیست. اگر وارد حساب نشده‌اید، می‌توانید تمرین کنید اما پاسخ‌ها فقط تا وقتی صفحه باز است نگه داشته می‌شوند.' }));

  const stepItems = STAGES.map((st, i) => h('li', { 'data-stage': st.id }, [h('span', { class: 'num', text: String(i + 1) }), h('span', { text: st.title })]));
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'مراحل تمرین' }, stepItems);
  wrap.append(stepper);
  const answers = {};
  const boxes = [];
  const panels = {};

  const factsPanel = h('section', { class: 'case-panel' }, [h('h2', { text: CASE.title }), h('h3', { text: 'وقایع' })]);
  const facts = h('ol');
  CASE.facts.forEach((f) => facts.append(h('li', { text: f })));
  factsPanel.append(facts, h('h3', { text: 'مسائل حقوقی' }));
  const issuesList = h('ol');
  CASE.issues.forEach((issue) => issuesList.append(h('li', { text: issue.text })));
  factsPanel.append(issuesList);
  panels.facts = factsPanel;

  const answersPanel = h('form', { class: 'form', novalidate: '', 'aria-label': 'پاسخ موت‌کورت' });

  // شبیه‌ساز پرسش قاضی/طرف مقابل: بازخورد قاعده‌مند و محلی، بدون ادعای مدل هوش مصنوعی.
  const coachPanel = h('section', { class: 'case-panel moot-coach', 'aria-label': 'پرسش‌گر آموزشی' }, [
    h('h2', { text: 'پرسش‌گر آموزشی' }),
    h('p', { text: 'به پرسش قاضی یا وکیل طرف مقابل پاسخ دهید. بازخورد بر اساس وجود نشانه‌های استدلال در متن است و جایگزین ارزیابی استاد یا بررسی حقوقی نیست.' }),
  ]);
  const coachRole = h('select', { 'aria-label': 'نقش پرسش‌گر' }, [
    h('option', { value: 'judge', text: 'قاضی' }),
    h('option', { value: 'opposing', text: 'وکیل طرف مقابل' }),
  ]);
  const coachQuestion = h('p', { class: 'lead', role: 'status', 'aria-live': 'polite', text: getCoachPrompt('judge', 0) });
  const coachAnswer = h('textarea', { rows: '4', maxlength: '3000', 'aria-label': 'پاسخ به پرسش‌گر', placeholder: 'پاسخ شفاهی خود را به‌صورت متن بنویسید…' });
  const coachFeedback = h('div', { class: 'coach-feedback', role: 'status', 'aria-live': 'polite' });
  const coachSubmit = h('button', { class: 'btn', type: 'button', text: 'ارزیابی ساختار پاسخ' });
  const coachNext = h('button', { class: 'btn secondary', type: 'button', text: 'پرسش بعدی' });
  let coachIndex = 0;
  function updateCoachPrompt() {
    coachQuestion.textContent = getCoachPrompt(coachRole.value, coachIndex);
    coachFeedback.replaceChildren();
  }
  coachRole.addEventListener('change', () => { coachIndex = 0; updateCoachPrompt(); });
  coachNext.addEventListener('click', () => { coachIndex += 1; updateCoachPrompt(); });
  coachSubmit.addEventListener('click', () => {
    const result = evaluateOralAnswer(coachAnswer.value);
    coachFeedback.replaceChildren(
      h('p', { class: 'lead', text: `امتیاز ساختاری اولیه: ${result.score}٪` }),
      h('ul', {}, result.checks.map((item) => h('li', { text: `${item.passed ? '✓' : '○'} ${item.label}` }))),
      h('p', { class: 'muted', text: result.note }),
    );
  });
  coachPanel.append(h('div', { class: 'row' }, [coachRole]), coachQuestion, coachAnswer, h('div', { class: 'row' }, [coachSubmit, coachNext]), coachFeedback);
  answersPanel.append(coachPanel);

  // ضبط تمرین شفاهی فقط در مرورگر انجام می‌شود؛ فایل صوتی به سرور ارسال نمی‌شود.
  const MAX_MS = 5 * 60 * 1000;
  const audioPanel = h('section', { class: 'case-panel oral-practice rec-card', 'aria-label': 'تمرین شفاهی و ضبط صدا' }, [
    h('h2', { class: 'rec-title', text: 'پاسخ خود را ضبط کنید' }),
    h('p', { class: 'muted rec-lead', text: 'یک دفاع کوتاه ۱ تا ۳ دقیقه‌ای ارائه کنید. صدا فقط در همین صفحه نگه‌داری می‌شود و با بارگذاری مجدد صفحه از بین می‌رود.' }),
  ]);
  const recTimer = h('div', { class: 'rec-timer', role: 'timer', 'aria-live': 'off', text: '00:00' });
  const recBars = h('div', { class: 'rec-wave', 'aria-hidden': 'true' }, Array.from({ length: 28 }, () => h('span')));
  const recButton = h('button', { class: 'rec-button', type: 'button', 'aria-label': 'شروع ضبط صدا' }, [h('span', { class: 'rec-dot', 'aria-hidden': 'true' })]);
  const recHint = h('p', { class: 'rec-hint muted', text: 'برای شروع، دکمهٔ قرمز را بزنید.' });
  const audioStatus = h('p', { class: 'muted rec-status', role: 'status', 'aria-live': 'polite', text: 'هنوز صدایی ضبط نشده است.' });
  const audioPlayer = h('audio', { controls: '', preload: 'metadata', hidden: '', 'aria-label': 'پخش صدای ضبط‌شده' });
  audioPlayer.classList.add('oral-player');
  const playButton = h('button', { class: 'btn secondary', type: 'button', hidden: '', text: 'پخش' });
  const downloadButton = h('button', { class: 'btn secondary', type: 'button', hidden: '', text: 'دریافت فایل' });
  const resetButton = h('button', { class: 'btn secondary', type: 'button', hidden: '', text: 'ضبط دوباره' });
  playButton.addEventListener('click', () => {
    if (!audioUrl) return;
    audioPlayer.hidden = false;
    audioPlayer.play().catch((err) => {
      if (err?.name === 'NotAllowedError') audioStatus.textContent = 'مرورگر پخش خودکار را متوقف کرد. دوباره روی «پخش» بزنید یا نوار پخش‌کننده را استفاده کنید.';
      else showPlaybackFailure(err?.name || 'play');
    });
  });
  downloadButton.addEventListener('click', () => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = downloadButton.dataset.filename || 'wefagh-moot-court.webm';
    document.body.append(link);
    link.click();
    link.remove();
  });
  resetButton.addEventListener('click', () => {
    clearAudioUrl();
    audioPlayer.removeAttribute('src');
    audioPlayer.hidden = true;
    playButton.hidden = true;
    downloadButton.hidden = true;
    resetButton.hidden = true;
    recTimer.textContent = '00:00';
    recHint.textContent = 'برای شروع، دکمهٔ قرمز را بزنید.';
    audioStatus.textContent = 'هنوز صدایی ضبط نشده است.';
  });
  audioPanel.append(
    recTimer,
    recBars,
    h('div', { class: 'rec-controls' }, [recButton]),
    recHint,
    audioStatus,
    audioPlayer,
    h('div', { class: 'row oral-controls' }, [playButton, downloadButton, resetButton]),
  );
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let audioUrl = null;
  let chosenMime = '';
  let recordedMs = 0;
  let recordedBytes = 0;
  let recordedType = '';
  let playbackToken = 0;
  let playableConfirmed = false;
  let audioLimitTimer = null;
  let tickTimer = null;
  let levelFrame = null;
  let audioContext = null;
  let recordStartedAt = 0;
  function stopMeters() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (levelFrame) { cancelAnimationFrame(levelFrame); levelFrame = null; }
    recBars.querySelectorAll('span').forEach((bar) => { bar.style.height = '6px'; });
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
  }
  function releaseMicrophone() {
    if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    if (audioLimitTimer) { clearTimeout(audioLimitTimer); audioLimitTimer = null; }
    stopMeters();
  }
  function clearAudioUrl() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function startMeters(stream) {
    const bars = [...recBars.querySelectorAll('span')];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioContext = new AC();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(data);
        bars.forEach((bar, i) => {
          const v = data[Math.floor((i / bars.length) * data.length)] / 255;
          bar.style.height = `${6 + Math.round(v * 54)}px`;
        });
        levelFrame = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      audioContext = null;
    }
  }
  function setRecordingUi(recording) {
    recButton.classList.toggle('recording', recording);
    recButton.setAttribute('aria-label', recording ? 'پایان ضبط' : 'شروع ضبط صدا');
  }
  function showPlaybackFailure(code) {
    if (!audioUrl) return;
    recHint.textContent = 'پخش این ضبط ممکن نشد. فایل را دریافت کنید.';
    audioStatus.textContent = `پخش این ضبط در مرورگر شما انجام نشد (کد ${code}). فایل را با «دریافت فایل» ذخیره کنید و با برنامهٔ پخش‌کنندهٔ خود باز کنید.`;
    audioStatus.className = 'muted rec-status err';
  }
  audioPlayer.addEventListener('loadedmetadata', () => {
    if (!audioUrl) return;
    playableConfirmed = true;
    audioStatus.className = 'muted rec-status';
    recHint.textContent = 'آماده: می‌توانید پخش کنید یا فایل را دریافت کنید.';
    const seconds = Number.isFinite(audioPlayer.duration) ? Math.round(audioPlayer.duration * 1000) : recordedMs;
    audioStatus.textContent = `ضبط آماده است · مدت ${formatTime(seconds)} · ${(recordedBytes / 1024).toFixed(0)} کیلوبایت · نوع ${recordedType || 'ناشناخته'}`;
  });
  audioPlayer.addEventListener('error', () => { if (audioUrl) showPlaybackFailure(audioPlayer.error?.code ?? 'error'); });
  recButton.addEventListener('click', async () => {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      audioStatus.textContent = 'مرورگر یا محیط فعلی از ضبط صدا پشتیبانی نمی‌کند. از مرورگر به‌روز و اتصال امن HTTPS استفاده کنید.';
      return;
    }
    recButton.disabled = true;
    audioStatus.className = 'muted rec-status';
    audioStatus.textContent = 'در انتظار اجازهٔ دسترسی به میکروفون…';
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported?.(type));
      chosenMime = mimeType || '';
      mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      audioChunks = [];
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size) audioChunks.push(event.data);
      });
      mediaRecorder.addEventListener('error', () => {
        audioStatus.textContent = 'در ضبط صدا خطایی رخ داد. لطفاً دوباره تلاش کنید.';
        setRecordingUi(false);
        recButton.disabled = false;
        releaseMicrophone();
      });
      mediaRecorder.addEventListener('stop', async () => {
        releaseMicrophone();
        setRecordingUi(false);
        recButton.disabled = false;
        const chunks = audioChunks;
        audioChunks = [];
        const total = chunks.reduce((n, c) => n + c.size, 0);
        if (!total) {
          recHint.textContent = 'برای ضبط دوباره، دکمهٔ قرمز را بزنید.';
          audioStatus.textContent = 'صدایی ضبط نشد (فایل خالی است). مجوز میکروفون را بررسی و دوباره تلاش کنید.';
          return;
        }
        // نوع فایل از روی بایت‌های خود فایل تشخیص داده می‌شود؛ Safari ممکن است mimeType را خالی بگذارد.
        const type = await detectAudioType(chunks[0], mediaRecorder?.mimeType || chosenMime);
        const blob = new Blob(chunks, { type });
        recordedMs = Date.now() - recordStartedAt;
        recordedBytes = blob.size;
        recordedType = type;
        playableConfirmed = false;
        clearAudioUrl();
        audioUrl = URL.createObjectURL(blob);
        const token = ++playbackToken;
        audioPlayer.src = audioUrl;
        audioPlayer.hidden = false;
        playButton.hidden = false;
        downloadButton.dataset.filename = `wefagh-moot-court${extensionFor(type)}`;
        downloadButton.hidden = false;
        resetButton.hidden = false;
        recHint.textContent = 'ضبط تمام شد. در حال بررسی قابلیت پخش…';
        audioStatus.textContent = `فایل ساخته شد: ${formatTime(recordedMs)} · ${(recordedBytes / 1024).toFixed(0)} کیلوبایت. در حال بررسی پخش…`;
        audioPlayer.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // اگر پس از ۵ ثانیه فایل بارگذاری نشد، موفقیت کاذب نشان داده نمی‌شود.
        setTimeout(() => {
          if (token === playbackToken && !playableConfirmed) showPlaybackFailure(audioPlayer.error?.code ?? 'timeout');
        }, 5000);
      }, { once: true });
      recordStartedAt = Date.now();
      mediaRecorder.start(1000);
      setRecordingUi(true);
      recButton.disabled = false;
      recHint.textContent = 'در حال ضبط… دوباره برای پایان بزنید.';
      audioStatus.textContent = 'در حال ضبط. حداکثر زمان ۵ دقیقه است.';
      recTimer.textContent = '00:00';
      tickTimer = setInterval(() => { recTimer.textContent = formatTime(Date.now() - recordStartedAt); }, 250);
      startMeters(mediaStream);
      audioLimitTimer = setTimeout(() => {
        if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
      }, MAX_MS);
    } catch (error) {
      releaseMicrophone();
      recButton.disabled = false;
      audioStatus.textContent = error?.name === 'NotAllowedError'
        ? 'دسترسی میکروفون رد شد. مجوز میکروفون را در تنظیمات مرورگر فعال کنید.'
        : 'میکروفون در دسترس نیست. اتصال امن HTTPS و تنظیمات دستگاه را بررسی کنید.';
    }
  });
  audioPanel.append(h('p', { class: 'muted rec-privacy', text: 'نکتهٔ حریم خصوصی: این نسخه صدا را بارگذاری یا در حساب ذخیره نمی‌کند؛ در صورت نیاز فایل را با دکمهٔ «دریافت فایل» روی دستگاه خود نگه دارید.' }));
  answersPanel.append(audioPanel);

  CASE.issues.forEach((issue, i) => {
    const ta = h('textarea', { id: `moot-${issue.id}`, rows: '6', maxlength: '4000' });
    ta.addEventListener('input', scheduleSave);
    ta.addEventListener('blur', () => { if (saveTimer) clearTimeout(saveTimer); saveNow(); });
    answers[issue.id] = ta;
    answersPanel.append(h('div', { class: 'field' }, [h('label', { for: `moot-${issue.id}`, text: `مسئلهٔ ${i + 1}: ${issue.text}` }), ta]));
  });
  panels.answers = answersPanel;

  const checkPanel = h('form', { class: 'form', novalidate: '', 'aria-label': 'خودارزیابی موت‌کورت' });
  const checklist = h('fieldset', { class: 'checklist' }, [h('legend', { text: 'چک‌لیست خودارزیابی' })]);
  CASE.rubric.forEach((item, i) => {
    const cb = h('input', { type: 'checkbox', id: `rub-${i}` });
    cb.addEventListener('change', scheduleSave);
    boxes.push(cb);
    checklist.append(h('label', { class: 'check-item', for: `rub-${i}` }, [cb, document.createTextNode(' ' + item)]));
  });
  checkPanel.append(checklist);
  const out = h('div', { role: 'status', 'aria-live': 'polite' });
  checkPanel.append(h('div', { class: 'row' }, [h('button', { class: 'btn', type: 'submit', text: 'ثبت خودارزیابی' })]));
  panels.check = checkPanel;

  const resultPanel = h('section', { class: 'case-panel' }, [h('h2', { text: 'نتیجهٔ تمرین' }), out]);
  const reset = h('button', { class: 'btn secondary', type: 'button', text: 'پاک کردن پاسخ‌ها' });
  resultPanel.append(h('div', { class: 'row' }, [reset]));
  panels.result = resultPanel;
  let current = 0;
  let userSignedIn = false;
  let activeSessionId = null;
  let saveTimer = null;
  let saving = false;
  let saveAgain = false;
  const prev = h('button', { class: 'btn secondary', type: 'button', text: '→ مرحلهٔ قبلی' });
  const next = h('button', { class: 'btn', type: 'button', text: 'مرحلهٔ بعد ←' });
  const nav = h('div', { class: 'row moot-nav' }, [prev, next]);
  const body = h('div', { class: 'moot-body' }, STAGES.map((st) => panels[st.id]));
  wrap.append(body, nav);

  function payload() {
    return {
      caseId: CASE.id,
      title: `موت‌کورت — ${CASE.title.replace('پروندهٔ فرضی: ', '')}`,
      answers: Object.fromEntries(Object.entries(answers).map(([key, ta]) => [key, ta.value])),
      rubric: boxes.map((b) => b.checked),
      stage: STAGES[current].id,
      score: current === 3 ? scoreRubric(boxes.filter((b) => b.checked).length, boxes.length) : null,
    };
  }
  function loadPayload(session) {
    for (const [key, ta] of Object.entries(answers)) ta.value = typeof session.answers?.[key] === 'string' ? session.answers[key] : '';
    boxes.forEach((b, i) => { b.checked = Boolean(session.rubric?.[i]); });
    out.replaceChildren();
    if (session.score !== null && session.score !== undefined) {
      out.append(h('p', { class: 'lead', text: `آخرین خودارزیابی ذخیره‌شده: ${session.score}٪ معیارها رعایت شده‌اند.` }));
      out.append(h('p', { text: `پاسخ‌های کامل (حداقل ۴۰ نویسه): ${Object.values(answers).filter((ta) => ta.value.trim().length >= 40).length} از ${CASE.issues.length}.` }));
      out.append(h('p', { class: 'muted', text: CASE.outlineHint }));
    }
    const idx = STAGES.findIndex((s) => s.id === session.stage);
    show(idx < 0 ? 0 : idx);
    saveStatus.textContent = `تمرین شمارهٔ ${session.id} بازیابی شد.`;
  }
  function show(index) {
    current = Math.max(0, Math.min(STAGES.length - 1, index));
    STAGES.forEach((st, i) => {
      panels[st.id].hidden = i !== current;
      const li = stepper.children[i];
      li.classList.toggle('done', i < current);
      if (i === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    prev.hidden = current === 0;
    next.hidden = current === STAGES.length - 1;
    if (activeSessionId) scheduleSave();
    panels[STAGES[current].id].querySelector('h2, textarea, input, button')?.focus?.({ preventScroll: true });
  }
  async function refreshSessions(selectedId = null) {
    const res = await getJson('/api/moot/sessions');
    if (!res.ok) return;
    sessionSelect.replaceChildren(h('option', { value: '', text: 'انتخاب تمرین ذخیره‌شده…' }));
    for (const session of res.data.sessions || []) {
      const date = session.updatedAt ? new Date(session.updatedAt).toLocaleDateString('fa-IR') : '';
      sessionSelect.append(h('option', { value: String(session.id), text: `${session.title} · ${date}` }));
    }
    if (selectedId) sessionSelect.value = String(selectedId);
  }
  async function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!userSignedIn || !activeSessionId) return;
    if (saving) { saveAgain = true; return; }
    saving = true;
    saveStatus.textContent = 'در حال ذخیرهٔ پاسخ‌ها…';
    try {
      const result = await sendJson('PATCH', `/api/moot/sessions/${activeSessionId}`, payload());
      if (result.ok) saveStatus.textContent = `ذخیره شد · ${new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
      else if (result.status === 401) saveStatus.textContent = 'نشست ورود منقضی شده است؛ دوباره وارد حساب شوید.';
      else saveStatus.textContent = 'ذخیره انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; saveNow(); }
    }
  }
  function scheduleSave() {
    if (!userSignedIn || !activeSessionId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveStatus.textContent = 'تغییرات ثبت شد؛ در انتظار ذخیره…';
    saveTimer = setTimeout(saveNow, 700);
  }
  prev.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  sessionSelect.addEventListener('change', async () => {
    if (!sessionSelect.value) return;
    if (activeSessionId) await saveNow();
    const res = await getJson(`/api/moot/sessions/${encodeURIComponent(sessionSelect.value)}`);
    if (res.ok) { activeSessionId = res.data.session.id; loadPayload(res.data.session); }
    else saveStatus.textContent = 'بازیابی تمرین انجام نشد.';
  });
  newSession.addEventListener('click', async () => {
    if (!userSignedIn) { window.location.hash = '#/account'; return; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    activeSessionId = null;
    for (const ta of Object.values(answers)) ta.value = '';
    for (const b of boxes) b.checked = false;
    out.replaceChildren();
    show(0);
    const created = await postJson('/api/moot/sessions', { ...payload(), title: `تمرین جدید — ${CASE.title.replace('پروندهٔ فرضی: ', '')}` });
    if (!created.ok || !created.data?.id) { saveStatus.textContent = 'ساخت تمرین ناموفق بود. لطفاً دوباره تلاش کنید.'; return; }
    activeSessionId = created.data.id;
    saveStatus.textContent = 'تمرین جدید ساخته شد.';
    await refreshSessions(activeSessionId);
    await saveNow();
  });
  checkPanel.addEventListener('submit', (e) => {
    e.preventDefault();
    const checked = boxes.filter((b) => b.checked).length;
    const filled = Object.values(answers).filter((ta) => ta.value.trim().length >= 40).length;
    const pct = scoreRubric(checked, CASE.rubric.length);
    out.replaceChildren(
      h('p', { class: 'lead', text: `خودارزیابی: ${pct}٪ معیارها رعایت شده‌اند.` }),
      h('p', { text: `پاسخ‌های کامل (حداقل ۴۰ نویسه): ${filled} از ${CASE.issues.length}.` }),
      h('p', { class: 'muted', text: CASE.outlineHint })
    );
    show(3);
    scheduleSave();
  });
  reset.addEventListener('click', () => {
    for (const ta of Object.values(answers)) ta.value = '';
    for (const b of boxes) b.checked = false;
    out.replaceChildren();
    show(0);
    scheduleSave();
  });

  getJson('/api/me').then(async (me) => {
    userSignedIn = me.ok && Boolean(me.data?.user);
    if (!userSignedIn) {
      accountStatus.textContent = 'برای ذخیره و بازیابی تمرین‌ها، ابتدا وارد حساب شوید.';
      newSession.textContent = 'ورود برای ذخیرهٔ تمرین';
      sessionSelect.disabled = true;
      return;
    }
    accountStatus.textContent = `خوش آمدید ${me.data.user.displayName || ''}؛ تمرین‌ها به حساب شما متصل‌اند.`;
    await refreshSessions();
  }).catch(() => { accountStatus.textContent = 'وضعیت حساب در دسترس نیست.'; });
  window.addEventListener('pagehide', () => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    releaseMicrophone();
    clearAudioUrl();
  }, { once: true });
  show(0);
  return wrap;
}
