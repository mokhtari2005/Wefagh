// صفحه‌های آکادمی: فهرست دوره‌ها، آموزش پرونده‌محور، آزمونک و ثبت پیشرفت. DOM امن.
import { getJson, postJson } from './api.js';
import { icon } from './icons.js';
import { messageFor } from './auth-messages.js';
import { ACADEMY_TOOLS } from './academy-tools.js';
export { ACADEMY_TOOLS } from './academy-tools.js';

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function loginHint() {
  return h('div', { class: 'notice', role: 'note' }, [
    h('p', { text: 'برای ثبت‌نام در دوره، ذخیره پاسخ تمرین‌ها و ثبت پیشرفت، ابتدا وارد حساب خود شوید.' }),
    h('p', {}, [h('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })]),
  ]);
}



export function academyToolCards(items = ACADEMY_TOOLS) {
  return h('nav', { class: 'academy-tools', 'aria-label': 'بخش‌های آکادمی' },
    items.map((item) => h('a', { class: 'academy-tool', href: item.href }, [
      h('span', { class: 'academy-tool-icon', 'aria-hidden': 'true' }, [icon(item.icon, { size: 26 })]),
      h('span', { class: 'academy-tool-title', text: item.title }),
    ])));
}

export function academyList() {
  return h('div', {}, [
    h('h1', { text: 'آکادمی وکالت شهرام مختاری' }),
    h('p', { class: 'lead', text: 'آموزش، تمرین دادرسی و ابزارهای حرفه‌ای وکالت در یک مسیر یکپارچه.' }),
    academyToolCards(),
  ]);
}

export async function academyCoursesPage() {
  const wrap = h('div', {}, [
    h('p', {}, [h('a', { href: '#/academy', text: '← بازگشت به آکادمی' })]),
    h('h1', { text: 'دوره‌های آموزشی' }),
    h('p', { class: 'lead', text: 'هر درس با مطالعه، تحلیل پرونده، تمرین کتبی و آزمونک پیش می‌رود؛ نتیجه و پیشرفت در حساب کارآموز ثبت می‌شود.' }),
  ]);
  const grid = h('div', { class: 'cards' });
  wrap.append(grid);
  const res = await getJson('/api/academy/courses');
  if (!res.ok) {
    wrap.append(h('p', { class: 'form-status err', role: 'alert', text: messageFor(res.networkError ? 'NETWORK' : res.data?.error) }));
    return wrap;
  }
  if (!res.data.courses?.length) {
    wrap.append(h('p', { class: 'notice', role: 'status', text: 'در حال حاضر دوره‌ای برای نمایش وجود ندارد.' }));
    return wrap;
  }
  for (const c of res.data.courses) {
    grid.append(h('a', { class: 'card', href: `#/academy/${c.id}` }, [
      h('span', { class: 'badge', text: `${c.level} · ${c.lessonCount} درس` }),
      c.status === 'draft' ? h('span', { class: 'badge badge-draft', text: 'پیش‌نویس ـ در دست تهیه' }) : h('span'),
      c.enrolled ? h('span', { class: 'badge badge-soft', text: 'ثبت‌نام شده‌اید' }) : h('span'),
      h('h3', { text: c.title }), h('p', { text: c.summary }),
      h('span', { class: 'muted', text: 'مشاهده سرفصل‌ها و شروع یادگیری ←' }),
    ]));
  }
  return wrap;
}

export async function academyCourse(courseId) {
  const wrap = h('div');
  const res = await getJson(`/api/academy/courses/${encodeURIComponent(courseId)}`);
  if (!res.ok) {
    const notPublished = res.data?.error === 'COURSE_NOT_PUBLISHED';
    wrap.append(
      h('h1', { text: notPublished ? 'این دوره هنوز منتشر نشده است' : 'دوره پیدا نشد' }),
      h('p', { class: 'lead', text: notPublished ? 'محتوای این دوره در حال تهیه و بررسی است؛ پس از تأیید گروه، در این بخش فعال می‌شود.' : '' }),
      h('p', {}, [h('a', { href: '#/courses', text: 'بازگشت به دوره‌های آموزشی' })]),
    );
    return wrap;
  }
  const course = res.data.course;
  wrap.append(
    h('p', {}, [h('a', { href: course.format === 'workshop' ? '#/academy/workshops' : '#/courses', text: course.format === 'workshop' ? '← همه کارگاه‌ها' : '← همه دوره‌ها' })]),
    h('h1', { text: course.title }),
    h('p', { class: 'muted', text: course.level }),
    h('p', { class: 'lead', text: course.summary }),
    h('div', { class: 'notice', text: (course.format === 'workshop' ? 'روش کارگاه: ' : 'روش دوره: ') + 'درس را بخوانید، پرونده یا مسئله را تحلیل کنید، پاسخ کتبی بدهید و آزمونک را بگذرانید. قبولی در آزمونک، درس را در کارنامه شما ثبت می‌کند. پاسخ تشریحی نیز جداگانه با هوش مصنوعی و بر اساس معیارهای اعلام‌شده ارزیابی می‌شود؛ قبولی مستلزم پاسخ تستی صحیح و کسب حداقل ۶۰ از ۱۰۰ در پاسخ تشریحی است. برای حفظ محرمانگی، در تمرین‌ها فقط از اطلاعات فرضی یا بی‌نام‌سازی‌شده استفاده کنید و مشخصات موکل یا پرونده واقعی را وارد نکنید.' })
  );
  if (course.status === 'draft') {
    wrap.append(h('div', { class: 'notice', role: 'note' }, [h('p', { text: 'این دوره پیش‌نویس است. ثبت‌نام و دسترسی کاربران عادی به محتوا غیرفعال است.' })]));
  }
  const area = h('div', { role: 'region', 'aria-live': 'polite' });
  wrap.append(area);
  const me = await getJson('/api/me');
  if (!me.ok) {
    area.append(loginHint(), lessonsList(course, null));
    return wrap;
  }
  await renderProgress(area, course, me.data.user);
  return wrap;
}

async function renderProgress(area, course, user) {
  const prog = await getJson(`/api/academy/progress?courseId=${encodeURIComponent(course.id)}`);
  const state = prog.ok ? prog.data : { enrolled: false, completedLessonIds: [], assessments: [] };
  area.replaceChildren();
  if (course.status === 'draft' && !state.enrolled) {
    area.append(h('p', { class: 'muted', text: 'ثبت‌نام در این دوره هنوز فعال نشده است.' }), lessonsList(course, null));
    return;
  }
  if (!state.enrolled) {
    const status = h('p', { class: 'form-status', role: 'status' });
    const btn = h('button', { class: 'btn', type: 'button', text: course.format === 'workshop' ? 'ثبت‌نام و شروع کارگاه' : 'ثبت‌نام و شروع دوره' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await postJson('/api/academy/enroll', { courseId: course.id });
      if (r.ok) await renderProgress(area, course, user);
      else { btn.disabled = false; status.className = 'form-status err'; status.textContent = messageFor(r.networkError ? 'NETWORK' : r.data?.error); }
    });
    area.append(h('div', { class: 'notice' }, [h('p', { text: 'برای ذخیره تمرین‌ها و مشاهده کارنامه، ابتدا در این دوره ثبت‌نام کنید.' }), btn, status]), lessonsList(course, null));
    return;
  }
  const done = new Set(state.completedLessonIds || []);
  const assessments = new Map((state.assessments || []).map((a) => [a.lessonId, a]));
  const summary = h('section', { class: 'academy-progress panel' }, [
    h('h2', { text: 'کارنامه این دوره' }),
    h('p', { class: 'muted', text: `${done.size} از ${course.lessons.length} درس با موفقیت تکمیل شده است.` }),
    h('progress', { max: String(course.lessons.length), value: String(done.size), 'aria-label': 'پیشرفت دوره' }),
    h('p', { class: 'muted', text: `${assessments.size} تمرین ثبت‌شده · قبولی هر آزمونک با پاسخ صحیح و ارائه تمرین کتبی ثبت می‌شود.` }),
  ]);
  area.append(summary, lessonsList(course, {
    done, assessments,
    onAssess: (lessonId, answerIndex, responseText, feedback) => submitAssessment(area, course, lessonId, answerIndex, responseText, feedback, done, assessments, summary, user),
  }));
  if (course.lessons.length && done.size === course.lessons.length) area.append(courseCertificateCard(user, course));
}


function academyCertificateSeal() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'نشان ترازوی عدالت');
  svg.setAttribute('focusable', 'false');
  const paths = [
    'M32 8v42 M20 17h24 M24 17 14 34 M40 17 50 34 M14 34c0 6 20 6 20 0 M50 34c0 6-20 6-20 0 M22 52h20 M26 57h12',
    'M32 8l-4 5h8z'
  ];
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return h('div', { class: 'academy-cert-seal', 'aria-label': 'مهر آکادمی وکالت شهرام مختاری — Shahram Mokhtari Law Academy Seal' }, [
    h('span', { class: 'academy-cert-seal-fa', text: 'مهر آکادمی' }),
    svg,
    h('small', { class: 'academy-cert-seal-en', text: 'ACADEMY SEAL' }),
  ]);
}

function courseCertificateCard(user, course) {
  const issued = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  const serial = (course.id + '-' + (user?.id || '0')).toUpperCase();
  const certificate = h('article', { class: 'academy-print-sheet academy-course-certificate', dir: 'rtl' }, [
    h('header', { class: 'academy-cert-header' }, [
      academyCertificateSeal(),
      h('div', { class: 'academy-cert-brand-lockup' }, [
        h('div', { class: 'academy-cert-brand', text: 'آکادمی وکالت شهرام مختاری' }),
        h('div', { class: 'academy-cert-brand-en', text: 'SHAHRAM MOKHTARI LAW ACADEMY' }),
      ]),
      h('div', { class: 'academy-cert-header-mark', text: '⚖' }),
    ]),
    h('p', { class: 'academy-cert-kicker', text: course.format === 'workshop' ? 'گواهینامه پایان کارگاه آموزشی' : 'گواهینامه پایان دوره آموزشی' }),
    h('h2', { class: 'academy-cert-title', text: 'گواهینامه' }),
    h('p', { class: 'academy-cert-title-en', text: 'CERTIFICATE OF COMPLETION' }),
    h('p', { class: 'academy-cert-copy', text: 'بدین‌وسیله گواهی می‌شود' }),
    h('strong', { class: 'academy-cert-name', text: user?.displayName || 'شرکت‌کننده' }),
    h('p', { class: 'academy-cert-copy', text: course.format === 'workshop' ? 'کارگاه آموزشی زیر را با موفقیت به پایان رسانده است:' : 'دوره آموزشی زیر را با موفقیت به پایان رسانده است:' }),
    h('h3', { class: 'academy-cert-course', text: course.title }),
    h('div', { class: 'academy-cert-meta' }, [
      h('span', { text: 'تاریخ صدور: ' + issued }),
      h('span', { text: 'شماره گواهینامه: ' + serial }),
    ]),
    h('div', { class: 'academy-cert-signatures' }, [
      h('div', { class: 'academy-cert-signature' }, [h('span', { text: '' }), h('strong', { text: 'استاد دوره' })]),
      h('div', { class: 'academy-cert-signature' }, [h('span', { text: '' }), h('strong', { text: 'شهرام مختاری' }), h('small', { text: 'مدیر آکادمی وکالت' })]),
    ]),
    h('p', { class: 'academy-cert-footnote', text: course.format === 'workshop' ? 'این گواهینامه ناظر بر اتمام کارگاه آموزشی در آکادمی است و صلاحیت حرفه‌ای رسمی ایجاد نمی‌کند.' : 'این گواهینامه ناظر بر اتمام دوره آموزشی در آکادمی است.' }),
  ]);
  const actions = h('div', { class: 'academy-print-actions no-print' }, [
    h('button', { class: 'btn', type: 'button', text: 'چاپ گواهینامه / ذخیره PDF' }),
  ]);
  actions.querySelector('button').addEventListener('click', () => window.print());
  return h('section', { class: 'academy-print-wrap' }, [h('h2', { text: 'گواهینامه پایان دوره' }), certificate, actions]);
}

function legalReviewNodes(review, note = '') {
  if (!review) return [h('p', { class: 'notice', text: note || 'تحلیل مستندات حقوقی فعلاً در دسترس نیست؛ پاسخ شما ذخیره شده است.' })];
  const nodes = [h('h4', { text: 'تحلیل مستند پاسخ و مستندات حقوقی' })];
  if (review.essayAssessment) {
    nodes.push(h('h5', { text: 'نمره پاسخ تشریحی: ' + review.essayAssessment.score + ' از ۱۰۰' }));
    if (review.essayAssessment.feedback) nodes.push(h('p', { text: review.essayAssessment.feedback }));
    if (review.essayAssessment.criteria?.length) nodes.push(h('ul', {}, review.essayAssessment.criteria.map((x) => h('li', { text: x.criterion + ': ' + x.score + ' از ۲۵ — ' + (x.feedback || '') }))));
    if (review.essayAssessment.improvements?.length) nodes.push(h('h5', { text: 'موارد قابل بهبود' }), h('ul', {}, review.essayAssessment.improvements.map((x) => h('li', { text: x }))));
  }
  if (review.analysis) nodes.push(h('p', { text: review.analysis }));
  if (review.legalAuthorities?.length) {
    nodes.push(h('h5', { text: 'قوانین و مقررات' }), h('ul', {}, review.legalAuthorities.map((x) => h('li', { text: (x.law || 'منبع قانونی') + (x.article ? '، ماده ' + x.article : '') + ' — ' + (x.rule || '') + ' ' + (x.application || '') + ' [' + (x.status || 'نیازمند بررسی') + ']' }))));
  } else nodes.push(h('p', { class: 'muted', text: 'مستند قانونی دقیق در این پاسخ احراز نشده است؛ از درج شماره ماده حدسی خودداری شده.' }));
  if (review.fiqhPrinciples?.length) nodes.push(h('h5', { text: 'اصول فقهی و قواعد شرعی مرتبط' }), h('ul', {}, review.fiqhPrinciples.map((x) => h('li', { text: x.principle + ' — قلمرو: ' + (x.scope || '—') + '؛ تطبیق: ' + (x.application || '—') + ' [' + (x.status || 'نیازمند بررسی') + ']' }))));
  if (review.issues?.length) nodes.push(h('h5', { text: 'نکات نیازمند اصلاح' }), h('ul', {}, review.issues.map((x) => h('li', { text: x }))));
  nodes.push(h('p', { class: 'muted', text: review.verificationNote || 'استنادها را با متن رسمی و آخرین اصلاحات تطبیق دهید.' }));
  return nodes;
}

async function submitAssessment(area, course, lessonId, answerIndex, responseText, feedback, done, assessments, summary, user) {
  const form = feedback.closest('form');
  const button = form?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  const result = await postJson('/api/academy/assess', { courseId: course.id, lessonId, answerIndex, responseText });
  if (!result.ok) {
    if (button) button.disabled = false;
    feedback.replaceChildren(h('p', { class: 'form-status err', role: 'alert', text: result.data?.message || messageFor(result.networkError ? 'NETWORK' : result.data?.error) }));
    return;
  }
  const data = result.data;
  assessments.set(lessonId, { lessonId, score: data.score, passed: data.passed, explanation: data.explanation, responseText });
  if (data.passed) done.add(lessonId);
  summary.querySelector('p').textContent = `${done.size} از ${course.lessons.length} درس با موفقیت تکمیل شده است.`;
  summary.querySelector('progress').value = String(done.size);
  summary.lastChild.textContent = `${assessments.size} تمرین ثبت‌شده · آخرین نتیجه: ${data.score} از ۱۰۰`;
  feedback.replaceChildren(
    h('p', { class: data.passed ? 'form-status success' : 'form-status err', role: 'status', text: data.message }),
    h('p', { text: `امتیاز آزمونک: ${data.score} از ۱۰۰` }),
    h('p', { class: 'muted', text: data.explanation }),
    ...legalReviewNodes(data.legalReview, data.legalReviewNote)
  );
  const lessonArticle = feedback.closest('.lesson');
  if (data.passed && lessonArticle) lessonArticle.prepend(h('span', { class: 'badge badge-soft', text: 'درس تکمیل شد' }));
  if (data.passed && done.size === course.lessons.length && !area.querySelector('.academy-course-certificate')) area.append(courseCertificateCard(user, course));
}

function lessonsList(course, progress) {
  const list = h('div', { class: 'lessons academy-lessons' });
  course.lessons.forEach((lesson, i) => {
    const saved = progress?.assessments.get(lesson.id);
    const isDone = progress?.done.has(lesson.id);
    const article = h('article', { class: 'lesson academy-lesson' }, [
      h('h2', { text: `درس ${i + 1}: ${lesson.title}` }),
      h('p', { class: 'lesson-body pre-wrap', text: lesson.body }),
    ]);
    if (lesson.learning) {
      article.append(
        h('h3', { text: 'تمرین پرونده‌محور' }),
        h('p', { text: lesson.learning.assignment }),
        h('ul', { class: 'academy-rubric' }, lesson.learning.rubric.map((item) => h('li', { text: item }))),
        h('h3', { text: 'آزمونک پایان درس' }),
        h('p', { text: lesson.learning.quiz.question })
      );
      const form = h('form', { class: 'academy-assessment' });
      const options = h('fieldset', { class: 'academy-quiz-options' }, [h('legend', { text: 'یک گزینه را انتخاب کنید' })]);
      lesson.learning.quiz.options.forEach((option, index) => {
        const id = `quiz-${lesson.id}-${index}`;
        const input = h('input', { type: 'radio', name: `answer-${lesson.id}`, id, value: String(index), required: 'required' });
        if (saved && saved.passed && saved.answerIndex === index) input.checked = true;
        if (isDone) input.disabled = true;
        options.append(h('label', { class: 'academy-quiz-option', for: id }, [input, h('span', { text: option })]));
      });
      const response = h('textarea', { name: 'responseText', rows: '6', maxlength: '12000', required: 'required', placeholder: 'تحلیل خود را بنویسید؛ پاسخ باید دست‌کم ۳۰ نویسه داشته باشد.' });
      response.value = saved?.responseText || '';
      if (isDone) response.readOnly = true;
      const feedback = h('div', { class: 'academy-feedback', 'aria-live': 'polite' });
      if (saved) {
        feedback.append(
          h('p', { class: saved.passed ? 'form-status success' : 'form-status', text: saved.passed ? `قبول‌شده · ${saved.score} از ۱۰۰` : `آخرین امتیاز: ${saved.score} از ۱۰۰ · برای تلاش دوباره پاسخ را اصلاح کنید.` }),
          saved.explanation ? h('p', { class: 'muted', text: saved.explanation }) : h('span'),
          ...legalReviewNodes(saved.legalReview)
        );
      }
      const submit = h('button', { class: 'btn', type: 'submit', text: isDone ? 'درس تکمیل شده' : 'ثبت تمرین و ارزیابی' });
      submit.disabled = Boolean(isDone) || !progress;
      form.append(options, h('label', { class: 'academy-answer-label' }, [h('span', { text: 'پاسخ تشریحی تمرین' }), response]), submit, feedback);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const selected = form.querySelector(`input[name="answer-${lesson.id}"]:checked`);
        if (!selected) { feedback.textContent = 'یک گزینه از آزمونک انتخاب کنید.'; return; }
        if (response.value.trim().length < 30) { feedback.textContent = 'پاسخ تشریحی باید دست‌کم ۳۰ نویسه داشته باشد.'; response.focus(); return; }
        progress.onAssess(lesson.id, Number(selected.value), response.value, feedback);
      });
      article.append(form);
    } else {
      article.append(h('div', { class: 'notice', text: 'برای این درس هنوز تمرین تعاملی تعریف نشده است.' }));
    }
    if (isDone) article.prepend(h('span', { class: 'badge badge-soft', text: 'تکمیل‌شده' }));
    list.append(article);
  });
  return list;
}

/** مرکز آزمون مرحله‌ای با تصحیح قطعی تستی و ارزیابی تشریحی سمت سرور. */
export async function academyExamsPage() {
  const wrap=h('div',{class:'academy-exam-center'});
  wrap.append(h('p',{},[h('a',{href:'#/academy',text:'← بازگشت به آکادمی'})]),h('h1',{text:'مرکز آزمون و ارزیابی هوشمند'}),h('p',{class:'lead',text:'آزمون‌های موضوعی و مرحله‌ای در دروس اصلی حقوق؛ شامل پرسش‌های چهارگزینه‌ای و پاسخ تشریحی با ارزیابی هوش مصنوعی.'}),h('div',{class:'notice',text:'۴۰٪ نمره از بخش تستی و ۶۰٪ از پاسخ تشریحی محاسبه می‌شود. ارزیابی هوش مصنوعی آموزشی است و جایگزین نظر استاد یا بررسی منابع رسمی نیست.'}));
  const area=h('div',{role:'region','aria-live':'polite'});wrap.append(area);
  const me=await getJson('/api/me');if(!me.ok){area.append(loginHint());return wrap;}
  const load=await getJson('/api/academy/exams');
  if(!load.ok){area.append(h('p',{class:'form-status err',text:messageFor(load.networkError?'NETWORK':load.data?.error)}));return wrap;}
  const subjects=h('div',{class:'cards'});
  area.append(h('h2',{text:'انتخاب درس'}),subjects);
  for(const s of load.data.subjects){
    const card=h('article',{class:'card'},[h('h3',{text:s.title}),h('p',{text:s.description}),h('p',{class:'muted',text:`${s.questionCount} سؤال در بانک · هر آزمون ۱۰ تست (۳ آسان، ۴ متوسط، ۳ سخت) و ۱ سؤال تشریحی`})]);
    const btn=h('button',{class:'btn',type:'button',text:'شروع آزمون'});
    btn.addEventListener('click',()=>start(s.id,area,me.data.user));card.append(btn);subjects.append(card);
  }
  if(load.data.attempts?.length){
    area.append(h('h2',{text:'سوابق آزمون'}));
    const history=h('div',{class:'table-wrap'});
    for(const a of load.data.attempts)history.append(h('p',{class:'notice',text:`${a.subject_title} · ${a.grading_status==='graded'?`نمره ${a.total_score} از ۱۰۰`:'در انتظار تکمیل تصحیح'} · ${new Date(a.created_at).toLocaleDateString('fa-IR')}`}));
    area.append(history);
  }
  return wrap;
}

function examReportCard(user, attempt, result) {
  const issued = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  const membershipNo = user?.membershipNo || 'پس از تکمیل اطلاعات عضویت';
  const fullName = user?.displayName || user?.name || 'شرکت‌کننده';
  const professionalTitle = user?.professionalTitle || '—';
  const position = user?.position || '—';
  const objective = Number(result.objectiveScore ?? 0);
  const essay = Number(result.essayScore ?? 0);
  const total = Number(result.totalScore ?? Math.round(objective * .4 + essay * .6));
  const review = h('section', { class: 'academy-exam-review' }, [
    h('h2', { text: 'پاسخ‌نامه و تحلیل آزمون' }),
    h('p', { class: 'muted', text: 'پاسخ درست هر سؤال، توضیح آن و پاسخ پیشنهادی سؤال تشریحی در این بخش آمده است.' }),
    h('article', { class: 'academy-review-essay' }, [
      h('h3', { text: 'صورت سؤال تشریحی' }),
      h('p', { text: result.essayPrompt || attempt.essayPrompt || 'پرسش تشریحی این آزمون' }),
      h('h3', { text: 'پاسخ پیشنهادی و استدلال' }),
      h('p', { text: result.sampleAnswer || 'پاسخ پیشنهادی مستقلی برای این سؤال تولید نشد؛ معیارهای ارزیابی و بازخورد زیر مبنای بررسی پاسخ شماست.' }),
      h('h4', { text: 'منطق و مراحل استدلال' }),
      h('ul', {}, (result.reasoning || []).map(x => h('li', { text: x }))),
      h('h4', { text: 'مستندات قانونی و مقررات' }),
      (result.legalAuthorities || []).length
        ? h('ul', {}, result.legalAuthorities.map(a => h('li', { text: [a.source, a.article ? 'ماده/تبصره ' + a.article : '', a.rule, a.application, a.certainty ? 'درجه اطمینان: ' + a.certainty : ''].filter(Boolean).join(' — ') })))
        : h('p', { class: 'muted', text: 'برای این مسئله مستند شماره‌دار قابل اتکایی ارائه نشده است؛ متن قوانین و اصلاحات باید از منبع رسمی کنترل شود.' }),
      (result.fiqhPrinciples || []).length ? h('h4', { text: 'اصول فقهی و قواعد شرعی مرتبط' }) : null,
      (result.fiqhPrinciples || []).length ? h('ul', {}, result.fiqhPrinciples.map(p => h('li', { text: [p.principle, p.scope, p.application].filter(Boolean).join(' — ') }))) : null,
      h('h4', { text: 'ارزیابی پاسخ شما' }),
      h('p', { text: result.overall || '' }),
      h('ul', {}, (result.criteria || []).map(c => h('li', { text: `${c.criterion}: ${c.score} از ۲۰ — ${c.feedback}` }))),
      h('p', { class: 'muted', text: result.verificationNote || 'استنادها باید با متن رسمی و آخرین اصلاحات قوانین و مقررات تطبیق داده شوند. این ارزیابی آموزشی است.' }),
    ]),
  ]);
  for (const [index, item] of (result.questionReviews || []).entries()) {
    const legalReview = (result.objectiveLegalReviews || []).find(x => x.questionId === item.questionId) || {};
    const row = h('article', { class: 'academy-review-question' }, [
      h('h3', { text: `سؤال ${index + 1}: ${item.question}` }),
      h('p', { class: item.isCorrect ? 'academy-answer-correct' : 'academy-answer-wrong', text: 'پاسخ شما: ' + (item.selectedAnswer || 'بدون پاسخ') }),
      h('p', { class: 'academy-answer-correct', text: 'پاسخ صحیح: ' + item.correctAnswer }),
      h('p', { text: 'استدلال: ' + (legalReview.explanation || item.explanation) }),
      ...(legalReview.legalAuthorities || []).map(a => h('p', { class: 'muted', text: ['مستند: ' + (a.source || ''), a.article ? 'ماده/تبصره ' + a.article : '', a.rule, a.application].filter(Boolean).join(' — ') })),
      ...(legalReview.fiqhPrinciples || []).map(p => h('p', { class: 'muted', text: ['قاعده فقهی: ' + (p.principle || ''), p.scope, p.application].filter(Boolean).join(' — ') })),
    ]);
    review.append(row);
  }
  const report = h('article', { class: 'academy-print-sheet academy-exam-report', dir: 'rtl' }, [
    h('div', { class: 'academy-report-brand', text: 'آکادمی وکالت شهرام مختاری' }),
    h('p', { class: 'academy-report-kicker', text: 'کارنامه ارزیابی آموزشی' }),
    h('h2', { text: 'کارنامه آزمون' }),
    h('h3', { class: 'academy-report-subject', text: attempt.subjectTitle || 'آزمون تخصصی حقوق' }),
    h('div', { class: 'academy-report-identity' }, [
      h('div', {}, [h('span', { text: 'نام و نام خانوادگی' }), h('strong', { text: fullName })]),
      h('div', {}, [h('span', { text: 'عنوان' }), h('strong', { text: professionalTitle })]),
      h('div', {}, [h('span', { text: 'سمت' }), h('strong', { text: position })]),
      h('div', {}, [h('span', { text: 'شماره عضویت' }), h('strong', { text: membershipNo })]),
    ]),
    h('div', { class: 'academy-report-scores' }, [
      h('div', {}, [h('span', { text: 'نمره تستی' }), h('strong', { text: objective + ' از ۱۰۰' })]),
      h('div', {}, [h('span', { text: 'نمره تشریحی' }), h('strong', { text: essay + ' از ۱۰۰' })]),
      h('div', { class: 'academy-report-total' }, [h('span', { text: 'نمره نهایی' }), h('strong', { text: total + ' از ۱۰۰' })]),
    ]),
    h('p', { class: 'academy-report-correct-count', text: `پاسخ صحیح تستی: ${Number(result.correctAnswers ?? 0)} از ${Number(result.totalQuestions ?? 10)} سؤال` }),
    h('div', { class: 'academy-report-bottom' }, [
      h('span', { text: 'تاریخ صدور: ' + issued }),
    ]),
    h('div', { class: 'academy-report-signature' }, [h('span', { text: 'مدیر آکادمی وکالت' }), h('strong', { text: 'شهرام مختاری' })]),
    h('p', { class: 'academy-report-note', text: 'این کارنامه صرفاً نتیجه یک ارزیابی آموزشی است و گواهی صلاحیت حرفه‌ای یا مدرک رسمی محسوب نمی‌شود.' }),
  ]);
  const printButton = h('button', { class: 'btn', type: 'button', text: 'چاپ کارنامه A5 / ذخیره PDF' });
  const backButton = h('button', { class: 'btn btn-outline', type: 'button', text: 'بازگشت به مرکز آزمون' });
  const actions = h('div', { class: 'academy-print-actions no-print' }, [printButton, backButton]);
  printButton.addEventListener('click', () => window.print());
  backButton.addEventListener('click', () => {
    if (window.location.hash === '#/academy/exams') window.dispatchEvent(new Event('hashchange'));
    else window.location.hash = '#/academy/exams';
  });
  return h('div', { class: 'academy-exam-results' }, [report, actions, review]);
}

async function start(subjectId,area,user){
  const r=await postJson('/api/academy/exams/start',{subjectId});
  if(!r.ok){area.append(h('p',{class:'form-status err',text:messageFor(r.networkError?'NETWORK':r.data?.error)}));return;}
  const a=r.data.attempt,section=h('section',{class:'panel academy-exam'});
  section.append(h('h2',{text:a.subjectTitle}),h('p',{class:'muted',text:'۱۰ پرسش تستی از بانک ۴۰۰ سؤالی: ۳ آسان، ۴ متوسط و ۳ سخت؛ سپس یک پرسش تشریحی را کامل کنید.'}));
  const form=h('form',{class:'academy-assessment'});
  for(const q of a.questions){
    const field=h('fieldset',{class:'academy-quiz-options'});const levelLabel={easy:'آسان',medium:'متوسط',hard:'سخت'}[q.difficulty]||'متوسط';field.append(h('legend',{},[h('span',{class:'academy-question-level '+q.difficulty,text:levelLabel+' · '}),h('span',{text:q.question})]));
    q.options.forEach((option,i)=>{const id=`exam-${q.id}-${i}`;const input=h('input',{type:'radio',name:q.id,id,value:String(i),required:'required'});field.append(h('label',{class:'academy-quiz-option',for:id},[input,h('span',{text:option})]));});
    form.append(field);
  }
  const essay=h('textarea',{rows:'9',maxlength:'12000',required:'required',placeholder:'پاسخ تحلیلی خود را با استدلال و ذکر مبانی بنویسید.'});
  form.append(h('h3',{text:'پرسش تشریحی'}),h('p',{text:a.essay.prompt}),h('label',{class:'academy-answer-label'},[h('span',{text:'پاسخ تشریحی (حداقل ۸۰ نویسه)'}),essay]));
  const feedback=h('div',{class:'academy-feedback','aria-live':'polite'}),submit=h('button',{class:'btn',type:'submit',text:'ثبت پاسخ‌ها و تصحیح آزمون'});
  form.append(submit,feedback);form.addEventListener('submit',async event=>{
    event.preventDefault();if(essay.value.trim().length<80){feedback.textContent='پاسخ تشریحی باید دست‌کم ۸۰ نویسه داشته باشد.';essay.focus();return;}
    const answers={};for(const q of a.questions){const selected=form.querySelector(`input[name="${q.id}"]:checked`);if(!selected){feedback.textContent='به همه پرسش‌های تستی پاسخ دهید.';return;}answers[q.id]=Number(selected.value);}
    submit.disabled=true;submit.textContent='در حال تصحیح پاسخ‌ها…';
    const result=await postJson('/api/academy/exams/submit',{attemptId:a.id,answers,essayResponse:essay.value},{timeoutMs:90000});
    if(!result.ok){submit.disabled=false;submit.textContent='تلاش دوباره برای تصحیح';feedback.replaceChildren(h('p',{class:'form-status err',text:result.data?.message||(result.timeoutError?'زمان ارزیابی طولانی شد. پاسخ‌ها در همان آزمون حفظ شده‌اند؛ دوباره «تلاش برای تصحیح» را بزنید.':messageFor(result.networkError?'NETWORK':result.data?.error))}));return;}
    const g=result.data.result;
    area.replaceChildren(examReportCard(user,{id:a.id,subjectTitle:a.subjectTitle,essayPrompt:a.essay?.prompt},g));
  });
  area.replaceChildren(section);section.append(form);
}
