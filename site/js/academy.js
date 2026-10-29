// صفحه‌های آکادمی: فهرست دوره‌ها، جزئیات، ثبت‌نام و علامت‌زدن درس‌ها. DOM امن.
import { getJson, postJson } from './api.js';
import { messageFor } from './auth-messages.js';

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
    h('p', { text: 'برای ثبت‌نام در دوره و ذخیرهٔ پیشرفت، ابتدا وارد حساب خود شوید.' }),
    h('p', {}, [h('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })]),
  ]);
}

// فقط مقصدهای واقعی و فعال سایت. هر مورد باید به یک مسیر موجود در app.js اشاره کند.
export const ACADEMY_TOOLS = [
  { icon: '🎓', title: 'دوره‌های آموزشی', href: '#/academy' },
  { icon: '🎙', title: 'تمرین دادرسی و موت‌کورت', href: '#/moot-court' },
  { icon: '⚖️', title: 'دستیار هوشمند وکیل', href: '#/assistant' },
  { icon: '📁', title: 'بانک پرونده‌ها', href: '#/cases' },
  { icon: '🧮', title: 'ابزارهای حقوقی', href: '#/calculators' },
  { icon: '📅', title: 'تقویم مواعد', href: '#/deadlines' },
  { icon: '📰', title: 'مطالب و پادکست', href: '#/media' },
  { icon: '📊', title: 'داشبورد من', href: '#/dashboard' },
  { icon: '👤', title: 'حساب کاربری', href: '#/account' },
];

export function academyToolCards(items = ACADEMY_TOOLS) {
  return h('nav', { class: 'academy-tools', 'aria-label': 'بخش‌های آکادمی' },
    items.map((item) => h('a', { class: 'academy-tool', href: item.href }, [
      h('span', { class: 'academy-tool-icon', 'aria-hidden': 'true', text: item.icon }),
      h('span', { class: 'academy-tool-title', text: item.title }),
    ])));
}

export async function academyList() {
  const wrap = h('div', {}, [
    h('h1', { text: 'آکادمی وِفاق' }),
    h('p', { class: 'lead', text: 'دوره‌های کوتاه برای دانشجویان حقوق، کارآموزان و وکلا.' }),
    academyToolCards(),
    h('h2', { text: 'دوره‌ها' }),
  ]);
  const grid = h('div', { class: 'cards' });
  wrap.append(grid);
  const res = await getJson('/api/academy/courses');
  if (!res.ok) {
    wrap.append(h('p', { class: 'form-status err', role: 'alert', text: messageFor(res.networkError ? 'NETWORK' : res.data?.error) }));
    return wrap;
  }
  for (const c of res.data.courses) {
    grid.append(
      h('a', { class: 'card', href: `#/academy/${c.id}` }, [
        h('span', { class: 'badge', text: `${c.level} · ${c.lessonCount} درس` }),
        h('h3', { text: c.title }),
        h('p', { text: c.summary }),
      ])
    );
  }
  return wrap;
}

export async function academyCourse(courseId) {
  const wrap = h('div');
  const res = await getJson(`/api/academy/courses/${encodeURIComponent(courseId)}`);
  if (!res.ok) {
    wrap.append(h('h1', { text: 'دوره پیدا نشد' }), h('p', {}, [h('a', { href: '#/academy', text: 'بازگشت به آکادمی' })]));
    return wrap;
  }
  const course = res.data.course;
  wrap.append(h('h1', { text: course.title }), h('p', { class: 'muted', text: course.level }), h('p', { class: 'lead', text: course.summary }));

  const area = h('div', { role: 'region', 'aria-live': 'polite' });
  wrap.append(area);

  const me = await getJson('/api/me');
  if (!me.ok) {
    area.append(loginHint(), lessonsList(course, null));
    return wrap;
  }
  await renderProgress(area, course, null);
  return wrap;
}

async function renderProgress(area, course) {
  const prog = await getJson(`/api/academy/progress?courseId=${encodeURIComponent(course.id)}`);
  const state = prog.ok ? prog.data : { enrolled: false, completedLessonIds: [] };
  area.replaceChildren();

  if (!state.enrolled) {
    const status = h('p', { class: 'form-status', role: 'status' });
    const btn = h('button', { class: 'btn', type: 'button', text: 'ثبت‌نام در دوره' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await postJson('/api/academy/enroll', { courseId: course.id });
      if (r.ok) {
        await renderProgress(area, course);
      } else {
        btn.disabled = false;
        status.className = 'form-status err';
        status.textContent = messageFor(r.networkError ? 'NETWORK' : r.data?.error);
      }
    });
    area.append(h('p', {}, [btn]), status, lessonsList(course, null));
    return;
  }

  const done = new Set(state.completedLessonIds);
  area.append(
    h('p', { class: 'muted', text: `پیشرفت: ${done.size} از ${course.lessons.length} درس` }),
    lessonsList(course, { done, onComplete: (lessonId) => completeLesson(area, course, lessonId) })
  );
}

async function completeLesson(area, course, lessonId) {
  const r = await postJson('/api/academy/complete', { courseId: course.id, lessonId });
  if (r.ok) {
    await renderProgress(area, course);
  } else {
    const note = h('p', { class: 'form-status err', role: 'alert', text: messageFor(r.networkError ? 'NETWORK' : r.data?.error) });
    area.prepend(note);
  }
}

function lessonsList(course, progress) {
  const list = h('div', { class: 'lessons' });
  course.lessons.forEach((lesson, i) => {
    const isDone = progress?.done.has(lesson.id);
    const article = h('article', { class: 'lesson' }, [
      h('h2', { text: `${i + 1}. ${lesson.title}` }),
      h('p', { text: lesson.body }),
    ]);
    if (progress) {
      if (isDone) {
        article.append(h('p', { class: 'muted', text: '✓ تکمیل شد' }));
      } else {
        const btn = h('button', { class: 'btn', type: 'button', text: 'علامت‌گذاری به‌عنوان تکمیل‌شده' });
        btn.addEventListener('click', () => progress.onComplete(lesson.id));
        article.append(btn);
      }
    }
    list.append(article);
  });
  return list;
}
