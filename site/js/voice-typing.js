// ابزار تایپ صوتی: صدا برای تبدیل به متن به سرویس هوش مصنوعی ارسال می‌شود؛ مدل محلی فقط جایگزین دستی است.
import { postJson } from './api.js';
import { errorText, blobToBase64, baseMime } from './ai-client.js';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function insertTextAtCursor(editor, text) {
  editor.focus();
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const needsSpace = editor.textContent && !/[\s،؛.!؟:]$/.test(editor.textContent);
    const node = document.createTextNode((needsSpace ? ' ' : '') + text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.append(document.createTextNode(text));
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}


function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (view, at, value) => view.setUint16(at, value, true);
  const u32 = (view, at, value) => view.setUint32(at, value, true);
  for (const [name, value] of files) {
    const filename = encoder.encode(name);
    const data = encoder.encode(value);
    const crc = crc32(data);
    const local = new Uint8Array(30 + filename.length + data.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800);
    u16(lv, 8, 0); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, filename.length); u16(lv, 28, 0);
    local.set(filename, 30); local.set(data, 30 + filename.length);
    chunks.push(local);
    const entry = new Uint8Array(46 + filename.length);
    const cv = new DataView(entry.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800);
    u16(cv, 10, 0); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, filename.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0);
    u32(cv, 38, 0); u32(cv, 42, offset);
    entry.set(filename, 46); central.push(entry);
    offset += local.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
  return new Blob([...chunks, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function makeDocx(text) {
  const paragraphs = String(text).replace(/\r/g, '').split('\n').map((line) => {
    const content = line ? `<w:r><w:rPr><w:rtl/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>` : '<w:r><w:br/></w:r>';
    return `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="160" w:line="360"/></w:pPr>${content}</w:p>`;
  }).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
  return makeZip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', documentXml],
    ['word/styles.xml', styles],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function voiceTypingPage() {
  const root = h('section', { class: 'voice-typing' }, [
    h('h1', { text: 'تایپ صوتی' }),
  ]);

  const panel = h('section', { class: 'tool voice-typing-panel', 'aria-label': 'محیط تایپ صوتی' });
  const status = h('div', { class: 'voice-typing-status', 'data-state': 'idle', role: 'status', 'aria-live': 'polite' }, [
    h('span', { class: 'voice-typing-dot', 'aria-hidden': 'true' }),
    h('span', { text: 'آمادهٔ شروع؛ برای تایپ صوتی، دکمهٔ شروع ضبط را بزنید.' }),
  ]);
  const micIndicator = h('div', { class: 'voice-typing-mic', 'data-state': 'unknown', role: 'status', 'aria-live': 'polite' }, [h('span', { class: 'voice-typing-mic-icon', 'aria-hidden': 'true', text: '●' }), h('span', { text: 'وضعیت میکروفون: بررسی‌نشده' })]);
  const waveform = h('div', { class: 'voice-typing-waveform', 'data-state': 'idle', 'aria-label': 'نمایش زنده موج صدای میکروفون' }, [
    h('div', { class: 'voice-typing-waveform-heading' }, [
      h('span', { text: 'نمایش زنده صدای ورودی' }),
      h('span', { class: 'voice-typing-waveform-hint', text: 'هنگام ضبط فعال می‌شود' }),
    ]),
    h('canvas', { class: 'voice-typing-waveform-canvas', role: 'img', 'aria-label': 'موج زنده صدای ورودی میکروفون' }),
  ]);
  const waveformCanvas = waveform.querySelector('canvas');
  const waveformContext = waveformCanvas.getContext('2d');
  const language = h('select', { 'aria-label': 'زبان تشخیص گفتار' }, [
    h('option', { value: 'fa-IR', text: 'فارسی' }),
    h('option', { value: 'en-US', text: 'English' }),
    h('option', { value: 'ar-SA', text: 'العربية' }),
  ]);
  const prepare = h('button', { class: 'btn secondary voice-typing-prepare', type: 'button', text: 'آماده‌سازی مدل گفتار' });
  const start = h('button', { class: 'btn voice-typing-record', type: 'button', text: 'شروع ضبط' });
  const stop = h('button', { class: 'btn secondary', type: 'button', text: 'توقف و تبدیل به متن' });
  stop.disabled = true;
  const toolbar = h('div', { class: 'voice-typing-toolbar', role: 'toolbar', 'aria-label': 'قالب‌بندی متن' }, [
    h('button', { class: 'btn secondary small', type: 'button', text: 'پررنگ' }),
    h('button', { class: 'btn secondary small', type: 'button', text: 'مورب' }),
    h('button', { class: 'btn secondary small', type: 'button', text: 'فهرست نقطه‌ای' }),
    h('button', { class: 'btn secondary small', type: 'button', text: 'بازگشت تغییر' }),
  ]);
  const editor = h('div', { class: 'voice-typing-editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'متن قابل ویرایش', 'data-placeholder': 'اینجا صحبت کنید یا متن خود را تایپ کنید…', spellcheck: 'true' });
  const count = h('span', { text: '۰ واژه · ۰ نویسه' });
  const interim = h('span', { class: 'muted', text: '' });
  const actions = h('div', { class: 'voice-typing-actions' });
  const copy = h('button', { class: 'btn', type: 'button', text: 'کپی متن' });
  const download = h('button', { class: 'btn secondary', type: 'button', text: 'دریافت فایل متنی' });
  const word = h('button', { class: 'btn secondary', type: 'button', text: 'دانلود Word' });
  const pdf = h('button', { class: 'btn secondary', type: 'button', text: 'چاپ / ذخیره PDF' });
  const clear = h('button', { class: 'btn secondary', type: 'button', text: 'پاک‌کردن متن' });
  actions.append(copy, download, word, pdf, clear);
  const help = h('p', { class: 'muted', text: 'صدای ضبط‌شده فقط برای تبدیل به متن به سرویس هوش مصنوعی ارسال می‌شود و در این سامانه ذخیره نمی‌شود؛ برای استفاده باید وارد حساب خود باشید. هر نوبت ضبط حداکثر ۳۰ دقیقه است. برای دقت بهتر در محیطی کم‌صدا صحبت کنید.' });
  const controls = h('div', { class: 'voice-typing-controls' }, [
    h('div', { class: 'voice-typing-main-controls' }, [start, stop]),
    language,
  ]);
  panel.append(
    controls,
    status,
    waveform,
    editor,
    interim,
    toolbar,
    h('div', { class: 'voice-typing-meta' }, [count, micIndicator]),
    actions,
    help
  );
  root.append(panel);

  let recorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let recording = false;
  let transcriber = null;
  let transcriberPromise = null;
  let permissionStatus = null;
  let recordingTimeout = null;
  let speechRecognition = null;
  let recognitionShouldRun = false;
  let audioContextForMeter = null;
  let analyser = null;
  let meterSource = null;
  let waveformFrame = 0;
  const MAX_RECORDING_MS = 30 * 60 * 1000;
  const RETRYABLE = new Set(['AI_UNAVAILABLE', 'AI_PROVIDER_ERROR', 'AI_NETWORK_ERROR', 'AI_PROVIDER_BAD_RESPONSE', 'AI_EMPTY', 'NETWORK']);
  const MODEL_ID = 'onnx-community/whisper-tiny';

  function setMicState(state, message) {
    micIndicator.dataset.state = state;
    micIndicator.lastElementChild.textContent = message;
  }
  function setStatus(message, state = 'idle') {
    status.dataset.state = state;
    status.lastElementChild.textContent = message;
  }

  function paintIdleWaveform() {
    if (!waveformContext || !waveformCanvas) return;
    const width = Math.max(1, waveformCanvas.clientWidth);
    const height = Math.max(1, waveformCanvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    waveformCanvas.width = Math.round(width * dpr);
    waveformCanvas.height = Math.round(height * dpr);
    waveformContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    waveformContext.clearRect(0, 0, width, height);
    waveformContext.strokeStyle = getComputedStyle(waveform).getPropertyValue('--wave-muted').trim() || '#b9c4c2';
    waveformContext.lineWidth = 1.5;
    waveformContext.beginPath();
    waveformContext.moveTo(0, height / 2);
    waveformContext.lineTo(width, height / 2);
    waveformContext.stroke();
  }

  function stopWaveform() {
    if (waveformFrame) cancelAnimationFrame(waveformFrame);
    waveformFrame = 0;
    try { meterSource?.disconnect(); } catch { /* ignore */ }
    try { analyser?.disconnect(); } catch { /* ignore */ }
    meterSource = null;
    analyser = null;
    if (audioContextForMeter && audioContextForMeter.state !== 'closed') audioContextForMeter.close().catch(() => {});
    audioContextForMeter = null;
    waveform.dataset.state = 'idle';
    waveform.querySelector('.voice-typing-waveform-hint').textContent = 'هنگام ضبط فعال می‌شود';
    paintIdleWaveform();
  }

  async function startWaveform(stream) {
    stopWaveform();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !waveformContext) {
      waveform.dataset.state = 'unavailable';
      waveform.querySelector('.voice-typing-waveform-hint').textContent = 'نمایش موج در این مرورگر پشتیبانی نمی‌شود';
      return;
    }
    try {
      audioContextForMeter = new AudioContextClass();
      await audioContextForMeter.resume();
      analyser = audioContextForMeter.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      meterSource = audioContextForMeter.createMediaStreamSource(stream);
      meterSource.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      waveform.dataset.state = 'recording';
      waveform.querySelector('.voice-typing-waveform-hint').textContent = 'میکروفون در حال دریافت صداست';
      const draw = () => {
        if (!analyser || !waveformContext) return;
        const width = Math.max(1, waveformCanvas.clientWidth);
        const height = Math.max(1, waveformCanvas.clientHeight);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (waveformCanvas.width !== Math.round(width * dpr) || waveformCanvas.height !== Math.round(height * dpr)) {
          waveformCanvas.width = Math.round(width * dpr);
          waveformCanvas.height = Math.round(height * dpr);
        }
        waveformContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        waveformContext.clearRect(0, 0, width, height);
        analyser.getByteTimeDomainData(samples);
        waveformContext.lineWidth = 2;
        waveformContext.lineJoin = 'round';
        waveformContext.lineCap = 'round';
        waveformContext.strokeStyle = getComputedStyle(waveform).getPropertyValue('--wave-color').trim() || '#168b82';
        waveformContext.beginPath();
        const slice = width / samples.length;
        for (let i = 0; i < samples.length; i++) {
          const x = i * slice;
          const y = (samples[i] / 255) * height;
          if (i === 0) waveformContext.moveTo(x, y);
          else waveformContext.lineTo(x, y);
        }
        waveformContext.stroke();
        waveformFrame = requestAnimationFrame(draw);
      };
      draw();
    } catch (error) {
      console.warn('[voice-typing] live waveform unavailable', error?.name || 'Error');
      stopWaveform();
      waveform.dataset.state = 'unavailable';
      waveform.querySelector('.voice-typing-waveform-hint').textContent = 'ضبط فعال است؛ نمایش موج در این دستگاه در دسترس نیست';
    }
  }
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'microphone' }).then((permission) => {
      permissionStatus = permission;
      const refresh = () => {
        if (recording) return;
        if (permission.state === 'granted') setMicState('connected', 'مجوز میکروفون فعال است');
        else if (permission.state === 'denied') setMicState('disconnected', 'دسترسی میکروفون مسدود است');
        else setMicState('unknown', 'برای شروع، اجازهٔ دسترسی میکروفون را بدهید');
      };
      refresh();
      permission.addEventListener?.('change', refresh);
    }).catch(() => setMicState('unknown', 'وضعیت میکروفون هنگام شروع ضبط مشخص می‌شود'));
  }

  function startLiveRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      interim.textContent = 'تایپ زنده در این مرورگر پشتیبانی نمی‌شود؛ صدا ضبط و پس از توقف تبدیل خواهد شد.';
      interim.dataset.state = 'unsupported';
      return;
    }
    try {
      recognitionShouldRun = true;
      speechRecognition = new Recognition();
      speechRecognition.lang = language.value;
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.maxAlternatives = 1;
      speechRecognition.onresult = (event) => {
        let confirmed = '';
        let pending = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const value = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) confirmed += value;
          else pending += value;
        }
        if (confirmed.trim()) insertTextAtCursor(editor, confirmed.trim());
        interim.textContent = pending ? 'در حال تشخیص: ' + pending : (recording ? 'گفتار شما به‌صورت زنده در متن ثبت می‌شود.' : '');
        interim.dataset.state = pending ? 'pending' : 'live';
        updateCount();
      };
      speechRecognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          interim.textContent = 'دسترسی تشخیص زنده داده نشد؛ ضبط ادامه دارد و پس از توقف تبدیل می‌شود.';
          interim.dataset.state = 'unsupported';
          recognitionShouldRun = false;
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          interim.textContent = 'تشخیص زنده موقتاً متوقف شد؛ فایل ضبط‌شده پس از پایان پردازش می‌شود.';
        }
      };
      speechRecognition.onend = () => {
        if (recognitionShouldRun && recording) {
          try { speechRecognition.start(); } catch { /* مرورگر ممکن است شروع مجدد را نپذیرد */ }
        }
      };
      speechRecognition.start();
      interim.textContent = 'گفتار شما به‌صورت زنده در متن ثبت می‌شود.';
      interim.dataset.state = 'live';
    } catch (error) {
      recognitionShouldRun = false;
      interim.textContent = 'تایپ زنده در این مرورگر فعال نشد؛ ضبط و تبدیل پس از توقف همچنان در دسترس است.';
      interim.dataset.state = 'unsupported';
      console.info('[voice-typing] live recognition unavailable', error?.name || 'Error');
    }
  }

  function stopLiveRecognition() {
    recognitionShouldRun = false;
    if (speechRecognition) {
      speechRecognition.onend = null;
      try { speechRecognition.stop(); } catch { /* ignore */ }
      speechRecognition = null;
    }
    interim.textContent = '';
  }

  function updateCount() {
    const text = editor.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    count.textContent = words.toLocaleString('fa-IR') + ' واژه · ' + text.length.toLocaleString('fa-IR') + ' نویسه';
  }
  editor.addEventListener('input', updateCount);

  toolbar.querySelectorAll('button').forEach((button, index) => {
    button.addEventListener('click', () => {
      editor.focus();
      if (index === 0) document.execCommand('bold');
      if (index === 1) document.execCommand('italic');
      if (index === 2) document.execCommand('insertUnorderedList');
      if (index === 3) document.execCommand('undo');
      updateCount();
    });
  });

  function classifyVoiceError(error, stage = 'inference') {
    const name = String(error?.name || '');
    const message = String(error?.message || '').toLowerCase();
    if (name === 'QuotaExceededError' || /quota|storage.*full|disk.*full/.test(message)) {
      return 'فضای ذخیره‌سازی مرورگر کافی نیست. کمی فضا در دستگاه خالی کنید، داده‌های موقت Safari را پاک کنید و دوباره مدل را آماده کنید.';
    }
    if (/out of memory|memory allocation|memory access out of bounds|allocate.*memory|wasm.*memory/.test(message) || name === 'RangeError') {
      return 'حافظهٔ موقت دستگاه برای اجرای مدل کافی نیست. برنامه‌های دیگر را ببندید و یک بار صفحه را دوباره باز کنید؛ در صورت تکرار، دستگاه ممکن است توان اجرای مدل محلی را نداشته باشد.';
    }
    if (stage === 'model' || (stage !== 'decode' && name === 'TypeError') || /fetch|network|failed to load|http.*(403|404|429|5\d\d)/.test(message)) {
      return 'دریافت مدل گفتار کامل نشد. اینترنت پایدار را بررسی کنید، محدودیت VPN یا فیلترشکن را موقتاً تغییر دهید و از دکمه «آماده‌سازی مدل گفتار» دوباره تلاش کنید.';
    }
    if (stage === 'decode' || name === 'NotSupportedError' || name === 'EncodingError' || /decode|codec|format|audio data/.test(message)) {
      return 'فایل ضبط‌شده در این مرورگر رمزگشایی نشد. Safari را به‌روز کنید و یک بار دیگر با ضبط کوتاه‌تر امتحان کنید.';
    }
    return 'پردازش گفتار با خطا متوقف شد. صفحه را دوباره باز کنید و مدل را آماده‌سازی کنید؛ اگر خطا تکرار شد، دوباره تلاش کنید یا از دیکتهٔ صفحه‌کلید گوشی استفاده کنید.';
  }

  async function loadTranscriber() {
    if (transcriber) return transcriber;
    if (transcriberPromise) return transcriberPromise;
    prepare.disabled = true;
    prepare.textContent = 'در حال آماده‌سازی…';
    setStatus('در حال بارگذاری موتور تشخیص گفتار؛ در اولین بار ممکن است چند دقیقه طول بکشد…', 'starting');
    transcriberPromise = (async () => {
      const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      module.env.allowLocalModels = false;
      module.env.allowRemoteModels = true;
      module.env.useBrowserCache = true;
      const pipe = await module.pipeline('automatic-speech-recognition', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (event) => {
          if (event.status === 'progress' && Number.isFinite(event.progress)) {
            setStatus('دریافت مدل تشخیص گفتار: ' + Math.round(event.progress) + '٪', 'starting');
          } else if (event.status === 'initiate') {
            setStatus('در حال دریافت فایل‌های مدل؛ لطفاً صفحه را نبندید…', 'starting');
          }
        },
      });
      transcriber = pipe;
      prepare.textContent = 'مدل آماده است';
      prepare.disabled = true;
      setStatus('مدل گفتار آماده است. می‌توانید ضبط را شروع کنید.');
      return pipe;
    })().catch((error) => {
      transcriberPromise = null;
      prepare.disabled = false;
      prepare.textContent = 'تلاش دوباره برای آماده‌سازی';
      console.error('[voice-typing] model load failed', error);
      const detail = classifyVoiceError(error, 'model');
      setStatus(detail, 'error');
      throw error;
    });
    return transcriberPromise;
  }

  prepare.addEventListener('click', () => { loadTranscriber().catch(() => {}); });

  function chooseMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const choices = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    return choices.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
  }

  function resampleAudio(audioBuffer, targetRate = 16000) {
    const sourceRate = audioBuffer.sampleRate;
    const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i));
    const mono = new Float32Array(audioBuffer.length);
    for (const channel of channels) {
      for (let i = 0; i < audioBuffer.length; i++) mono[i] += channel[i] / channels.length;
    }
    if (sourceRate === targetRate) return mono;
    const targetLength = Math.floor(audioBuffer.length * targetRate / sourceRate);
    const output = new Float32Array(targetLength);
    const ratio = sourceRate / targetRate;
    for (let i = 0; i < targetLength; i++) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, audioBuffer.length - 1);
      const fraction = position - left;
      output[i] = mono[left] * (1 - fraction) + mono[right] * fraction;
    }
    return output;
  }

  const SERVER_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
  const MAX_SERVER_AUDIO_BYTES = 12 * 1024 * 1024;
  let lastBlob = null;
  const retry = h('button', { class: 'btn secondary', type: 'button', text: 'تلاش دوباره' });
  const localFallback = h('button', { class: 'btn secondary', type: 'button', text: 'تبدیل روی دستگاه (آفلاین)' });
  retry.hidden = true;
  localFallback.hidden = true;
  prepare.hidden = true;
  panel.querySelector('.row').append(retry, localFallback);

  async function transcribeOnServer(blob) {
    lastBlob = blob;
    retry.hidden = true;
    localFallback.hidden = true;
    if (!blob || !blob.size) {
      setStatus('صدایی برای تبدیل ثبت نشد. دوباره ضبط کنید.', 'error');
      return;
    }
    let type = baseMime(blob.type);
    if (!SERVER_AUDIO_TYPES.includes(type)) type = 'audio/mp4';
    if (blob.size > MAX_SERVER_AUDIO_BYTES) {
      setStatus('حجم فایل صوتی از حد مجاز بیشتر است. لطفاً ضبط را کوتاه‌تر کنید یا آن را به چند بخش تقسیم کنید.', 'error');
      return;
    }
    setStatus('در حال تبدیل گفتار به متن…', 'processing');
    let res;
    try {
      const data = await blobToBase64(blob);
      const send = () => postJson('/api/ai/transcribe', { mimeType: type, data, language: language.value.slice(0, 2) }, { timeoutMs: 120000 });
      res = await send();
      // خطاهای موقت سرویس (قطع لحظه‌ای، پاسخ غیر JSON، خطای 5xx) یک بار خودکار تکرار می‌شوند.
      const code = res?.data?.error;
      const transient = !res.ok && (res.networkError || !code ? res.status !== 401 && res.status !== 413 && res.status !== 422 : RETRYABLE.has(code));
      if (transient) {
        setStatus('ارتباط با سرویس تبدیل گفتار قطع شد؛ در حال تلاش دوباره…', 'processing');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res = await send();
      }
    } catch (error) {
      console.error('[voice-typing] upload failed', error);
      res = { ok: false, data: { error: 'NETWORK' } };
    }
    const text = String(res?.data?.text || '').trim();
    if (res.ok && text) {
      insertTextAtCursor(editor, text);
      updateCount();
      setStatus('تبدیل انجام شد؛ متن به ویرایشگر اضافه شد. لطفاً آن را بازبینی کنید.');
      editor.focus();
      return;
    }
    if (res.ok) {
      setStatus('متنی از صدا تشخیص داده نشد؛ در محیط آرام‌تر دوباره ضبط کنید.', 'error');
      return;
    }
    let code = res?.data?.error;
    if (!code) code = res?.networkError ? (res.timeoutError ? 'AI_REQUEST_TIMEOUT' : 'NETWORK') : `HTTP_${res?.status || 0}`;
    console.error('[voice-typing] transcription failed', code, res?.status);
    const base = code.startsWith('HTTP_')
      ? 'پاسخ نامعتبر از سرور دریافت شد؛ احتمالاً خطای موقت سرور است.'
      : errorText(code);
    setStatus(`${base} (کد: ${code}${res?.status && !code.startsWith('HTTP_') ? ` · HTTP ${res.status}` : ''}${res?.data?.stage ? ` · مرحله: ${res.data.stage}` : ''}${res?.data?.errorType ? ` · نوع خطا: ${res.data.errorType}` : ''}${res?.data?.errorCode ? ` · جزئیات: ${res.data.errorCode}` : ''})`, 'error');
    if (code !== 'UNAUTHENTICATED') {
      retry.hidden = false;
      localFallback.hidden = false;
    }
  }
  retry.addEventListener('click', () => { transcribeOnServer(lastBlob); });
  localFallback.addEventListener('click', () => {
    retry.hidden = true;
    localFallback.hidden = true;
    prepare.hidden = false;
    transcribeBlob(lastBlob);
  });

  async function transcribeBlob(blob) {
    if (!blob || !blob.size) {
      setStatus('صدایی برای تبدیل ثبت نشد. دوباره ضبط کنید.', 'error');
      return;
    }
    let stage = 'model';
    try {
      const pipe = await loadTranscriber();
      stage = 'decode';
      setStatus('در حال آماده‌سازی فایل صوتی روی دستگاه…', 'starting');
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
      const audioContext = new AudioContextClass();
      let audioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      } finally {
        await audioContext.close().catch(() => {});
      }
      const samples = resampleAudio(audioBuffer, 16000);
      if (!samples.length) throw new Error('EMPTY_AUDIO');
      const languageName = { 'fa-IR': 'persian', 'en-US': 'english', 'ar-SA': 'arabic' }[language.value] || 'persian';
      stage = 'inference';
      setStatus('مدل روی همین دستگاه در حال تبدیل گفتار به متن است…', 'processing');
      const result = await pipe(samples, {
        task: 'transcribe',
        language: languageName,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text = String(result?.text || '').trim();
      if (!text) {
        setStatus('متنی از صدا تشخیص داده نشد؛ در محیط آرام‌تر دوباره ضبط کنید.', 'error');
        return;
      }
      insertTextAtCursor(editor, text);
      updateCount();
      setStatus('تبدیل انجام شد؛ متن به ویرایشگر اضافه شد. لطفاً آن را بازبینی کنید.');
      editor.focus();
    } catch (error) {
      console.error('[voice-typing] transcription failed at ' + stage, error);
      const message = error?.message === 'AUDIO_CONTEXT_UNAVAILABLE'
        ? 'این مرورگر ابزار لازم برای پردازش فایل صوتی را ندارد. Safari را به‌روز کنید.'
        : classifyVoiceError(error, stage);
      setStatus(message, 'error');
    }
  }

  async function finishRecording() {
    const mimeType = recorder?.mimeType || audioChunks[0]?.type || 'audio/mp4';
    const blob = new Blob(audioChunks, { type: mimeType });
    audioChunks = [];
    if (recordingTimeout) window.clearTimeout(recordingTimeout);
    recordingTimeout = null;
    stopWaveform();
    stopLiveRecognition();
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    recorder = null;
    start.disabled = false;
    stop.disabled = true;
    setMicState('connected', 'میکروفون آزاد شد · ضبط متوقف است');
    await transcribeOnServer(blob);
  }

  function stopRecording() {
    if (!recording || !recorder) return;
    recording = false;
    stopLiveRecognition();
    if (recordingTimeout) window.clearTimeout(recordingTimeout);
    recordingTimeout = null;
    stop.disabled = true;
    start.disabled = true;
    setMicState('waiting', 'ضبط پایان یافت · در حال آماده‌سازی فایل');
    setStatus('ضبط پایان یافت؛ فایل صوتی آمادهٔ تبدیل می‌شود…', 'starting');
    try { recorder.stop(); } catch { finishRecording(); }
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    start.disabled = true;
    setMicState('unavailable', 'ضبط صدا در این مرورگر در دسترس نیست');
    setStatus('این مرورگر امکان ضبط مستقیم صدا را ندارد. از نسخهٔ به‌روز Safari یا Chrome استفاده کنید یا از دیکتهٔ صفحه‌کلید گوشی کمک بگیرید.', 'error');
  } else {
    start.addEventListener('click', async () => {
      if (recording) return;
      start.disabled = true;
      setMicState('connecting', 'در حال درخواست دسترسی به میکروفون…');
      setStatus('برای شروع ضبط، اجازهٔ استفاده از میکروفون را بدهید.', 'starting');
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const mimeType = chooseMimeType();
        recorder = mimeType
          ? new MediaRecorder(mediaStream, { mimeType, audioBitsPerSecond: 32000 })
          : new MediaRecorder(mediaStream);
        audioChunks = [];
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data?.size) audioChunks.push(event.data);
        });
        recorder.addEventListener('error', () => {
          recording = false;
          stopWaveform();
          mediaStream?.getTracks().forEach((track) => track.stop());
          mediaStream = null;
          recorder = null;
          start.disabled = false;
          stop.disabled = true;
          setMicState('disconnected', 'خطا در دریافت صدای میکروفون');
          setStatus('ضبط صدا با خطا متوقف شد؛ دوباره تلاش کنید.', 'error');
        }, { once: true });
        recorder.addEventListener('stop', finishRecording, { once: true });
        // در Safari/iOS قطعه‌های زمانی MP4 ممکن است به‌درستی به هم متصل و رمزگشایی نشوند؛
        // ضبط را بدون timeslice آغاز می‌کنیم تا مرورگر یک فایل نهایی سالم تحویل دهد.
        recorder.start();
        recording = true;
        startWaveform(mediaStream);
        startLiveRecognition();
        recordingTimeout = window.setTimeout(() => {
          if (recording) {
            setStatus('حداکثر زمان هر نوبت ضبط ۳۰ دقیقه است؛ ضبط متوقف و تبدیل آغاز می‌شود.', 'starting');
            stopRecording();
          }
        }, MAX_RECORDING_MS);
        start.disabled = true;
        stop.disabled = false;
        setMicState('connected', 'میکروفون فعال است · در حال ضبط');
        setStatus('در حال ضبط صدا؛ برای پایان و تبدیل به متن، دکمه توقف را بزنید.', 'recording');
      } catch (error) {
        mediaStream?.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        start.disabled = false;
        stop.disabled = true;
        const message = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
          ? 'اجازهٔ میکروفون صادر نشد؛ دسترسی سایت را در تنظیمات Safari فعال کنید.'
          : error?.name === 'NotFoundError'
            ? 'میکروفونی در دستگاه پیدا نشد.'
            : error?.name === 'NotReadableError'
              ? 'میکروفون در برنامهٔ دیگری در حال استفاده است.'
              : 'شروع ضبط ممکن نشد؛ مجوز میکروفون و تنظیمات مرورگر را بررسی کنید.';
        setMicState('disconnected', 'میکروفون متصل نیست یا مجوز ندارد');
        setStatus(message, 'error');
      }
    });
    stop.addEventListener('click', stopRecording);
  }

  window.addEventListener('beforeunload', () => {
    if (recordingTimeout) window.clearTimeout(recordingTimeout);
    stopWaveform();
    if (recording) {
      try { recorder?.stop(); } catch { /* ignore */ }
      mediaStream?.getTracks().forEach((track) => track.stop());
    }
  }, { once: true });

  copy.addEventListener('click', async () => {
    const text = editor.innerText || '';
    if (!text.trim()) { setStatus('متنی برای کپی وجود ندارد.'); return; }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('متن با موفقیت کپی شد.');
    } catch {
      setStatus('کپی خودکار ممکن نشد؛ متن را انتخاب و کپی کنید.');
    }
  });
  download.addEventListener('click', () => {
    const text = editor.innerText || '';
    if (!text.trim()) { setStatus('متنی برای دریافت وجود ندارد.'); return; }
    const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: 'matn-typ-shode.txt' });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
  word.addEventListener('click', () => {
    const text = editor.innerText || '';
    if (!text.trim()) { setStatus('متنی برای دریافت وجود ندارد.'); return; }
    try {
      downloadBlob(makeDocx(text), 'matn-typ-shode.docx');
      setStatus('فایل Word آماده شد.');
    } catch {
      setStatus('ساخت فایل Word انجام نشد؛ دوباره تلاش کنید.');
    }
  });
  pdf.addEventListener('click', () => {
    const text = editor.innerText || '';
    if (!text.trim()) { setStatus('متنی برای تبدیل به PDF وجود ندارد.'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setStatus('پنجره چاپ مسدود شد؛ اجازه بازشدن پنجره را در مرورگر فعال کنید.'); return; }
    const safeText = xmlEscape(text).replace(/\n/g, '<br>');
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>متن تایپ‌شده</title><style>@page{size:A4;margin:22mm 20mm}body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:justify;font-size:13pt;line-height:2.1;color:#111;white-space:normal}main{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:16pt;text-align:center;margin:0 0 24px}</style></head><body><h1>متن تایپ‌شده</h1><main>${safeText}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
    printWindow.document.close();
    setStatus('پنجره چاپ باز شد؛ گزینهٔ «ذخیره به‌صورت PDF» را انتخاب کنید.');
  });
  clear.addEventListener('click', () => {
    if (!editor.innerText.trim()) return;
    if (!window.confirm('تمام متن نوشته‌شده پاک شود؟')) return;
    editor.replaceChildren();
    updateCount();
    setStatus('متن پاک شد.');
    editor.focus();
  });
  window.addEventListener('beforeunload', () => {
    if (recording) {
      try { recorder?.stop(); } catch { /* ignore */ }
      mediaStream?.getTracks().forEach((track) => track.stop());
    }
  }, { once: true });

  return root;
}
