// دفاع شفاهی آموزشی: قاضی و وکیل طرف مقابل پرسش می‌کنند؛ پاسخ با صدا یا متن داده می‌شود؛ گزارش نهایی ساخته می‌شود.
// هیچ مدل هوش مصنوعی یا کلید سرویس در این ماژول نیست. ورودی/خروجی صدا با قابلیت‌های داخلی مرورگر است
// (SpeechRecognition / speechSynthesis) و صدا به هیچ سرور ارسال نمی‌شود. در مرورگرهای بدون این قابلیت، پاسخ متنی کار می‌کند.
import { h } from './dom.js';
import { getCoachPrompt, evaluateOralAnswer } from './moot-coach.js';

export const ORAL_ROLES = Object.freeze(['judge', 'opposing']);
export const ROLE_LABEL = Object.freeze({ judge: 'قاضی', opposing: 'وکیل طرف مقابل' });
export const QUESTION_COUNT = 4;
export const DISCLAIMER = 'این گزارش آموزشی است و بر پایهٔ نشانه‌های متنی پاسخ ساخته شده؛ درستی حقوقی پاسخ را تأیید نمی‌کند. ارزیابی نهایی با استاد یا وکیل است.';

/** نقش هر پرسش را یکی در میان و با شمارهٔ پرسش مشخص می‌کند. */
export function questionPlan(count = QUESTION_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    role: ORAL_ROLES[i % ORAL_ROLES.length],
    prompt: getCoachPrompt(ORAL_ROLES[i % ORAL_ROLES.length], Math.floor(i / ORAL_ROLES.length)),
  }));
}

/**
 * گزارش ارزیابی از پاسخ‌های ثبت‌شده. ورودی: [{ role, prompt, answer }]
 * پاسخ‌های خالی امتیاز صفر می‌گیرند و در میانگین نیز حساب می‌شوند.
 */
export function buildEvaluationReport(entries) {
  const rows = entries.map((entry, i) => {
    const answer = String(entry.answer || '').trim();
    const evaluation = answer ? evaluateOralAnswer(answer) : { score: 0, checks: [], note: 'بدون پاسخ.' };
    return {
      number: i + 1,
      role: ROLE_LABEL[entry.role] || entry.role,
      prompt: entry.prompt,
      score: evaluation.score,
      missing: evaluation.checks.filter((c) => !c.passed).map((c) => c.label),
      note: evaluation.note,
    };
  });
  const average = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length) : 0;
  const missingCount = new Map();
  for (const row of rows) for (const label of row.missing) missingCount.set(label, (missingCount.get(label) || 0) + 1);
  const improve = [...missingCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label);
  return { average, rows, improve, disclaimer: DISCLAIMER };
}

/** متن ساده برای کپی یا ذخیرهٔ گزارش (بدون HTML). */
export function reportToText(report) {
  const lines = [`گزارش دفاع شفاهی آموزشی — میانگین ${report.average}٪`, ''];
  for (const r of report.rows) {
    lines.push(`${r.number}. ${r.role}: ${r.prompt}`, `   امتیاز: ${r.score}٪`);
    for (const m of r.missing) lines.push(`   نیازمند بهبود: ${m}`);
  }
  if (report.improve.length) lines.push('', `نکته‌های اولویت‌دار: ${report.improve.join('؛ ')}`);
  lines.push('', report.disclaimer);
  return lines.join('\n');
}

function speechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function canSpeak() {
  return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

/** بخش دفاع شفاهی. وضعیت و خطاها را همان‌جا نشان می‌دهد. */
export function oralDefensePanel() {
  const plan = questionPlan();
  const entries = plan.map((q) => ({ ...q, answer: '' }));
  let current = 0;
  let recognition = null;

  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const roleLine = h('p', { class: 'muted' });
  const question = h('p', { class: 'lead', id: 'oral-question' });
  const answer = h('textarea', { rows: '5', maxlength: '3000', 'aria-labelledby': 'oral-question', placeholder: 'پاسخ را بگویید یا بنویسید…' });
  const report = h('div', { role: 'region', 'aria-live': 'polite' });

  const speakBtn = h('button', { class: 'btn secondary', type: 'button', text: 'خواندن پرسش' });
  const micBtn = h('button', { class: 'btn secondary', type: 'button', text: 'ضبط پاسخ با صدا' });
  const nextBtn = h('button', { class: 'btn', type: 'button', text: 'ثبت پاسخ و پرسش بعدی' });
  const reportBtn = h('button', { class: 'btn secondary', type: 'button', text: 'ساخت گزارش' });
  const copyBtn = h('button', { class: 'btn secondary', type: 'button', text: 'کپی گزارش' });

  const Recognition = speechRecognitionCtor();
  if (!Recognition) micBtn.disabled = true;
  if (!canSpeak()) speakBtn.disabled = true;

  function speak(text) {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = 'fa-IR';
    window.speechSynthesis.speak(u);
  }

  function showQuestion() {
    const q = entries[current];
    roleLine.textContent = `نقش پرسش‌گر: ${ROLE_LABEL[q.role]} — پرسش ${current + 1} از ${entries.length}`;
    question.textContent = q.prompt;
    answer.value = q.answer;
    status.textContent = Recognition
      ? 'برای پاسخ شفاهی روی «ضبط پاسخ با صدا» بزنید؛ متن را هم می‌توانید ویرایش کنید.'
      : 'ورودی صوتی در این مرورگر در دسترس نیست؛ پاسخ را بنویسید.';
    nextBtn.textContent = current === entries.length - 1 ? 'ثبت آخرین پاسخ' : 'ثبت پاسخ و پرسش بعدی';
  }

  function saveAnswer() {
    entries[current].answer = answer.value;
  }

  function startRecording() {
    if (!Recognition) return;
    if (recognition) { recognition.stop(); return; }
    recognition = new Recognition();
    recognition.lang = 'fa-IR';
    recognition.interimResults = true;
    recognition.continuous = true;
    const base = answer.value ? `${answer.value.trim()} ` : '';
    recognition.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      answer.value = (base + text).slice(0, 3000);
    };
    recognition.onerror = (event) => {
      status.textContent = event.error === 'not-allowed'
        ? 'دسترسی به میکروفون داده نشد. پاسخ را بنویسید.'
        : `ضبط صدا متوقف شد (${event.error}). متن را ادامه دهید یا دوباره تلاش کنید.`;
    };
    recognition.onend = () => {
      recognition = null;
      micBtn.textContent = 'ضبط پاسخ با صدا';
      saveAnswer();
    };
    try {
      recognition.start();
      micBtn.textContent = 'توقف ضبط';
      status.textContent = 'در حال شنیدن پاسخ شما…';
    } catch {
      recognition = null;
      status.textContent = 'شروع ضبط ممکن نشد. پاسخ را بنویسید.';
    }
  }

  speakBtn.addEventListener('click', () => speak(entries[current].prompt));
  micBtn.addEventListener('click', startRecording);
  nextBtn.addEventListener('click', () => {
    if (recognition) recognition.stop();
    saveAnswer();
    if (current < entries.length - 1) {
      current += 1;
      showQuestion();
      speak(entries[current].prompt);
    } else {
      status.textContent = 'پاسخ‌ها ثبت شد. برای گزارش، «ساخت گزارش» را بزنید.';
      nextBtn.disabled = true;
      answer.disabled = true;
    }
  });
  reportBtn.addEventListener('click', () => {
    saveAnswer();
    const data = buildEvaluationReport(entries);
    report.replaceChildren(
      h('h3', { text: `گزارش ارزیابی — میانگین ${data.average}٪` }),
      h('ol', {}, data.rows.map((r) => h('li', {}, [
        h('p', { text: `${r.role}: ${r.prompt}` }),
        h('p', { text: `امتیاز ${r.score}٪` }),
        ...(r.missing.length ? [h('ul', {}, r.missing.map((m) => h('li', { text: `نیازمند بهبود: ${m}` })))] : []),
      ]))),
      ...(data.improve.length ? [h('p', { text: `نکته‌های اولویت‌دار: ${data.improve.join('؛ ')}` })] : []),
      h('p', { class: 'muted', text: data.disclaimer }),
    );
    copyBtn.dataset.text = reportToText(data);
  });
  copyBtn.addEventListener('click', async () => {
    const text = copyBtn.dataset.text || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'گزارش کپی شد.';
    } catch {
      status.textContent = 'کپی انجام نشد؛ متن گزارش را دستی انتخاب کنید.';
    }
  });

  showQuestion();
  return h('section', { class: 'case-panel oral-defense', 'aria-label': 'دفاع شفاهی آموزشی' }, [
    h('h2', { text: 'دفاع شفاهی آموزشی' }),
    h('p', { class: 'muted', text: 'قاضی و وکیل طرف مقابل یکی در میان پرسش می‌کنند. صدا فقط در مرورگر شما پردازش می‌شود و به سرور ارسال نمی‌شود.' }),
    roleLine,
    question,
    answer,
    h('div', { class: 'row' }, [speakBtn, micBtn, nextBtn]),
    status,
    h('div', { class: 'row' }, [reportBtn, copyBtn]),
    report,
  ]);
}
