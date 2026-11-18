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
    const needsSpace = editor.textContent && !/[\\s،؛.!؟:]$/.test(editor.textContent);
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
  const clear = h('button', { class: 'btn secondary', type: 'button', text: 'پاک‌کردن متن' });
  actions.append(copy, download, clear);
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
    const words = text.trim() ? text.trim().split(/\\s+/u).length : 0;
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
    const blob = new Blob(['\\uFEFF', text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: 'matn-typ-shode.txt' });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
