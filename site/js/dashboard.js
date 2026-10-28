// داشبورد شخصی: خلاصهٔ پیشرفت دوره‌ها، تمرین‌ها و مواعد آتی.
import { getJson } from './api.js';
import { messageFor } from './auth-messages.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

const STAGES = { facts: 'بررسی وقایع', answers: 'پاسخ‌گویی', check: 'خودارزیابی', result: 'نتیجه' };
const KINDS = { hearing: 'جلسهٔ رسیدگی', objection: 'اعتراض', appeal: 'تجدیدنظرخواهی', filing: 'ثبت دادخواست/لایحه', other: 'موعد دیگر' };

function metric(title, value, hint) {
  return el('article', { class: 'card dashboard-metric' }, [
    el('p', { class: 'muted', text: title }),
    el('p', { class: 'dashboard-metric-value', text: String(value) }),
    el('p', { class: 'muted', text: hint }),
  ]);
}

function section(title, content, link) {
  const box = el('section', { class: 'dashboard-section' }, [el('h2', { text: title }), content]);
  if (link) box.append(el('p', {}, [el('a', { href: link.href, text: link.text })]));
  return box;
}

export async function dashboardPage() {
  const wrap = el('div', {}, [
    el('h1', { text: 'داشبورد من' }),
    el('p', { class: 'lead', text: 'نمایی از مسیر یادگیری، تمرین‌های دادرسی و موعدهای پیشِ رو.' }),
  ]);
  const response = await getJson('/api/dashboard/summary');
  if (!response.ok) {
    const unauthenticated = response.status === 401 || response.data?.error === 'UNAUTHENTICATED';
    wrap.append(el('div', { class: 'notice', role: 'status' }, [
      el('p', { text: unauthenticated ? 'برای دیدن پیشرفت شخصی، ابتدا وارد حساب خود شوید.' : messageFor(response.networkError ? 'NETWORK' : response.data?.error) }),
      el('p', {}, [el('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })]),
    ]));
    return wrap;
  }

  const data = response.data.summary;
  const metrics = el('div', { class: 'cards dashboard-metrics' }, [
    metric('دوره‌های ثبت‌نام‌شده', data.enrolledCourseCount, 'دورهٔ آموزشی'),
    metric('درس‌های تکمیل‌شده', data.completedLessonCount, `از ${data.totalEnrolledLessons} درس ثبت‌نام‌شده`),
    metric('تمرین‌های موت‌کورت', data.mootSessionCount, 'تمرین ذخیره‌شده'),
    metric('میانگین امتیاز', data.averageScore === null ? '—' : `${data.averageScore} از ۱۰۰`, `${data.scoredSessionCount} تمرین دارای امتیاز`),
  ]);
  wrap.append(metrics);

  const courseList = el('div', { class: 'dashboard-list' });
  if (!data.courses.length) {
    courseList.append(el('p', { class: 'muted', text: 'هنوز در دوره‌ای ثبت‌نام نکرده‌اید.' }));
  } else {
    for (const course of data.courses) {
      const progress = el('progress', { class: 'dashboard-progress', max: '100', value: String(course.percent), 'aria-label': `پیشرفت ${course.title}` });
      courseList.append(el('article', { class: 'dashboard-row' }, [
        el('div', { class: 'dashboard-row-heading' }, [el('strong', { text: course.title }), el('span', { class: 'muted', text: `${course.percent}٪ · ${course.completedLessons}/${course.totalLessons} درس` })]),
        progress,
        el('p', {}, [el('a', { href: `#/academy/${encodeURIComponent(course.id)}`, text: 'ادامهٔ دوره' })]),
      ]));
    }
  }
  wrap.append(section('پیشرفت دوره‌ها', courseList, { href: '#/academy', text: 'مشاهدهٔ همهٔ دوره‌ها' }));

  const sessions = el('div', { class: 'dashboard-list' });
  if (!data.recentSessions.length) {
    sessions.append(el('p', { class: 'muted', text: 'هنوز تمرین ذخیره‌شده‌ای ندارید.' }));
  } else {
    for (const item of data.recentSessions) {
      sessions.append(el('article', { class: 'dashboard-row' }, [
        el('strong', { text: item.title }),
        el('p', { class: 'muted', text: `${STAGES[item.stage] || item.stage} · ${item.score === null ? 'بدون امتیاز ثبت‌شده' : `امتیاز ${item.score} از ۱۰۰`}` }),
      ]));
    }
  }
  wrap.append(section('تمرین‌های اخیر', sessions, { href: '#/moot-court', text: 'رفتن به موت‌کورت' }));

  const deadlines = el('div', { class: 'dashboard-list' });
  if (!data.upcomingDeadlines.length) {
    deadlines.append(el('p', { class: 'muted', text: 'موعد باز و آینده‌ای در تقویم شما ثبت نشده است.' }));
  } else {
    for (const item of data.upcomingDeadlines) {
      deadlines.append(el('article', { class: 'dashboard-row' }, [
        el('strong', { text: item.title }),
        el('p', { class: 'muted', text: `${item.dueDate} · ${KINDS[item.kind] || KINDS.other}` }),
      ]));
    }
  }
  wrap.append(section('موعدهای پیشِ رو', deadlines, { href: '#/deadlines', text: 'مدیریت تقویم مواعد' }));
  wrap.append(el('p', { class: 'muted', text: 'این گزارش بر اساس اطلاعات ثبت‌شده در حساب شما ساخته می‌شود؛ موعدها به‌صورت دستی وارد شده‌اند و محاسبهٔ خودکار مهلت قانونی نیستند.' }));
  return wrap;
}
