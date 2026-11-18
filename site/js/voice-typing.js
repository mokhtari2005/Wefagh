// ابزار مستقل تایپ صوتی؛ از Web Speech API مرورگر استفاده می‌کند و متن را به سرور نمی‌فرستد.
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
    h('span', { class: 'section-kicker', text: 'ابزار نگارش آکادمی' }),
    h('h1', { text: 'تایپ صوتی' }),
    h('p', { class: 'voice-typing-intro', text: 'متن خود را به فارسی یا زبان دلخواه بیان کنید؛ گفتار شما به نوشته تبدیل می‌شود و می‌توانید همان‌جا آن را ویرایش و آماده استفاده کنید.' }),
  ]);

  const panel = h('section', { class: 'tool voice-typing-panel', 'aria-label': 'محیط تایپ صوتی' });
  const status = h('div', { class: 'voice-typing-status', 'data-state': 'idle', role: 'status', 'aria-live': 'polite' }, [
    h('span', { class: 'voice-typing-dot', 'aria-hidden': 'true' }),
    h('span', { text: 'آمادهٔ شروع؛ برای تایپ صوتی، دکمهٔ شروع ضبط را بزنید.' }),
  ]);
  const language = h('select', { 'aria-label': 'زبان تشخیص گفتار' }, [
    h('option', { value: 'fa-IR', text: 'فارسی' }),
    h('option', { value: 'en-US', text: 'English' }),
    h('option', { value: 'ar-SA', text: 'العربية' }),
  ]);
  const start = h('button', { class: 'btn voice-typing-record', type: 'button', text: 'شروع ضبط' });
  const stop = h('button', { class: 'btn secondary', type: 'button', text: 'توقف ضبط' });
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
  const help = h('p', { class: 'muted', text: 'اگر مرورگر از تشخیص گفتار پشتیبانی نکند، می‌توانید از قابلیت دیکتهٔ صفحه‌کلید گوشی استفاده کنید. برای دقت بهتر، دسترسی میکروفون را فعال کنید و در محیطی کم‌صدا صحبت کنید.' });
  panel.append(
    h('div', { class: 'row' }, [start, stop, language]),
    status,
    toolbar,
    editor,
    h('div', { class: 'voice-typing-meta' }, [count, interim]),
    actions,
    help
  );
  root.append(panel);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let recording = false;
  let finalTranscript = '';
  let interimTranscript = '';

  function updateCount() {
    const text = editor.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    count.textContent = `${words.toLocaleString('fa-IR')} واژه · ${text.length.toLocaleString('fa-IR')} نویسه`;
  }
  function setStatus(message, state = 'idle') {
    status.dataset.state = state;
    status.lastElementChild.textContent = message;
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

  function stopRecognition(message = 'ضبط متوقف شد.') {
    recording = false;
    start.disabled = false;
    start.setAttribute('aria-pressed', 'false');
    stop.disabled = true;
    interim.textContent = '';
    setStatus(message, 'idle');
    try { recognition?.stop(); } catch { /* already stopped */ }
  }

  if (!SpeechRecognition) {
    start.disabled = true;
    setStatus('تشخیص گفتار مستقیم در این مرورگر در دسترس نیست؛ از دیکتهٔ صفحه‌کلید گوشی استفاده کنید.');
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = language.value;
    recognition.onstart = () => {
      recording = true;
      start.disabled = true;
      start.setAttribute('aria-pressed', 'true');
      stop.disabled = false;
      setStatus('در حال شنیدن صدای شما… برای پایان، توقف ضبط را بزنید.', 'recording');
    };
    recognition.onresult = (event) => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += phrase + ' ';
        else interimTranscript += phrase;
      }
      if (finalTranscript.trim()) {
        insertTextAtCursor(editor, finalTranscript.trimEnd());
        finalTranscript = '';
      }
      interim.textContent = interimTranscript ? 'در حال تشخیص: ' + interimTranscript : '';
    };
    recognition.onerror = (event) => {
      const messages = {
        'not-allowed': 'دسترسی میکروفون مسدود است؛ مجوز میکروفون مرورگر را فعال کنید.',
        'no-speech': 'صدایی تشخیص داده نشد؛ دوباره صحبت کنید.',
        'audio-capture': 'میکروفون پیدا نشد یا در دسترس نیست.',
        'network': 'تشخیص گفتار به اتصال شبکه نیاز دارد؛ اتصال را بررسی کنید.',
      };
      stopRecognition(messages[event.error] || 'در تشخیص گفتار خطایی رخ داد؛ دوباره تلاش کنید.');
    };
    recognition.onend = () => {
      if (recording) {
        try { recognition.start(); }
        catch { stopRecognition('ضبط پایان یافت. برای ادامه دوباره شروع ضبط را بزنید.'); }
      }
    };
    start.addEventListener('click', () => {
      if (recording) return;
      recognition.lang = language.value;
      finalTranscript = '';
      try { recognition.start(); }
      catch { setStatus('شروع ضبط ممکن نشد؛ چند لحظه بعد دوباره تلاش کنید.'); }
    });
    stop.addEventListener('click', () => stopRecognition());
    language.addEventListener('change', () => {
      if (recording) stopRecognition('برای تغییر زبان، ضبط متوقف شد. دوباره شروع کنید.');
      recognition.lang = language.value;
    });
  }

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
    if (recording) { try { recognition?.stop(); } catch { /* ignore */ } }
  }, { once: true });

  return root;
}
