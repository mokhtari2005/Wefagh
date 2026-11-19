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

function chartCard(title, subtitle, content) {
  return el('section', { class: 'dashboard-chart-card' }, [
    el('div', { class: 'dashboard-chart-heading' }, [el('h2', { text: title }), el('p', { class: 'muted', text: subtitle })]),
    content,
  ]);
}

function lessonDonut(completed, total) {
  const t = Math.max(0, Number(total) || 0);
  const c = Math.min(t, Math.max(0, Number(completed) || 0));
  const percent = t ? Math.round(c / t * 100) : 0;
  const circumference = 2 * Math.PI * 48;
  const wrap = el('div', { class: 'dashboard-donut-wrap', role: 'img', 'aria-label': t ? (percent + ' درصد تکمیل؛ ' + c + ' از ' + t + ' درس') : 'اطلاعاتی برای نمایش وجود ندارد' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'dashboard-donut'); svg.setAttribute('aria-hidden', 'true');
  function circle(cls) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    n.setAttribute('cx','60'); n.setAttribute('cy','60'); n.setAttribute('r','48'); n.setAttribute('fill','none'); n.setAttribute('stroke-width','12'); n.setAttribute('class',cls);
    return n;
  }
  svg.append(circle('dashboard-donut-track'));
  const arc = circle('dashboard-donut-progress');
  arc.setAttribute('stroke-dasharray', (circumference * percent / 100).toFixed(2) + ' ' + circumference.toFixed(2));
  arc.setAttribute('transform','rotate(-90 60 60)'); svg.append(arc);
  wrap.append(svg, el('div', { class: 'dashboard-donut-center' }, [
    el('strong', { text: t ? (percent + '٪') : '—' }), el('small', { text: 'تکمیل‌شده' })
  ]));
  const legend = el('div', { class: 'dashboard-chart-legend' }, [
    el('p', {}, [el('span', { class: 'dashboard-legend-dot completed' }), el('span', { text: 'تکمیل‌شده: ' + c })]),
    el('p', {}, [el('span', { class: 'dashboard-legend-dot remaining' }), el('span', { text: 'باقی‌مانده: ' + Math.max(0,t-c) })])
  ]);
  return el('div', { class: 'dashboard-donut-layout' }, [wrap, legend]);
}

function scoreColumns(sessions) {
  const scored = sessions.filter(x => x.score !== null && x.score !== undefined && Number.isFinite(Number(x.score))).slice(0,6).reverse();
  const chart = el('div', { class: 'dashboard-columns', role: 'img', 'aria-label': 'نمودار ستونی امتیاز تمرین‌های اخیر' });
  if (!scored.length) {
    chart.append(el('p', { class: 'muted dashboard-chart-empty', text: 'پس از ثبت امتیاز تمرین‌ها، نمودار عملکرد شما نمایش داده می‌شود.' }));
    return chart;
  }
  scored.forEach((item,index) => {
    const value = Math.min(100,Math.max(0,Number(item.score)));
    const track = el('div', { class: 'dashboard-column-track' });
    track.append(el('div', { class: 'dashboard-column-bar', style: '--bar-height:' + value + '%', title: 'امتیاز ' + value + ' از ۱۰۰' }));
    chart.append(el('div', { class: 'dashboard-column-item' }, [
      el('strong', { class: 'dashboard-column-value', text: String(value) }),
      track, el('small', { text: 'تمرین ' + (index+1) })
    ]));
  });
  return chart;
}

export async function dashboardPage() {
  const wrap = el('div', { class: 'dashboard-page' }, [
    el('header', { class: 'dashboard-page-heading' }, [
      el('span', { class: 'dashboard-kicker', text: 'پنل شخصی اعضا' }),
      el('h1', { text: 'داشبورد من' }),
      el('p', { class: 'lead', text: 'نمایی روشن از مسیر یادگیری، عملکرد تمرین‌ها و موعدهای پیشِ رو.' })
    ])
  ]);
  const response = await getJson('/api/dashboard/summary');
  if (!response.ok) {
    const unauthenticated = response.status === 401 || response.data?.error === 'UNAUTHENTICATED';
    wrap.append(el('div', { class: 'notice', role: 'status' }, [
      el('p', { text: unauthenticated ? 'برای دیدن پیشرفت شخصی، ابتدا وارد حساب خود شوید.' : messageFor(response.networkError ? 'NETWORK' : response.data?.error) }),
      el('p', {}, [el('a', { href: '#/account', text: 'ورود یا ثبت‌نام' })])
    ]));
    return wrap;
  }
  const data = response.data.summary;
  wrap.append(el('div', { class: 'dashboard-metrics dashboard-metrics-modern' }, [
    metric('دوره‌های ثبت‌نام‌شده',data.enrolledCourseCount,'دورهٔ آموزشی'),
    metric('درس‌های تکمیل‌شده',data.completedLessonCount,'از ' + data.totalEnrolledLessons + ' درس ثبت‌نام‌شده'),
    metric('تمرین‌های موت‌کورت',data.mootSessionCount,'تمرین ذخیره‌شده'),
    metric('میانگین امتیاز',data.averageScore === null ? '—' : (data.averageScore + ' از ۱۰۰'),data.scoredSessionCount + ' تمرین دارای امتیاز')
  ]));
  wrap.append(el('div', { class: 'dashboard-charts-grid' }, [
    chartCard('وضعیت یادگیری','نسبت درس‌های تکمیل‌شده به کل درس‌ها',lessonDonut(data.completedLessonCount,data.totalEnrolledLessons)),
    chartCard('امتیاز تمرین‌ها','امتیاز تمرین‌های اخیر از ۱۰۰',scoreColumns(data.recentSessions))
  ]));
  const courseList = el('div', { class: 'dashboard-list' });
  if (!data.courses.length) courseList.append(el('p',{class:'muted',text:'هنوز در دوره‌ای ثبت‌نام نکرده‌اید.'}));
  else data.courses.forEach(course => {
    const pct=Math.min(100,Math.max(0,Number(course.percent)||0));
    const progress=el('div',{class:'dashboard-course-progress',role:'progressbar','aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(pct),'aria-label':'پیشرفت '+course.title});
    progress.append(el('span',{style:'--course-progress:'+pct+'%'}));
    courseList.append(el('article',{class:'dashboard-row dashboard-course-row'},[
      el('div',{class:'dashboard-row-heading'},[el('strong',{text:course.title}),el('span',{class:'dashboard-course-percent',text:pct+'٪ · '+course.completedLessons+'/'+course.totalLessons+' درس'})]),
      progress,el('p',{},[el('a',{href:'#/academy/'+encodeURIComponent(course.id),text:'ادامهٔ دوره'})])
    ]));
  });
  wrap.append(section('پیشرفت دوره‌ها',courseList,{href:'#/academy',text:'مشاهدهٔ همهٔ دوره‌ها'}));
  const lower=el('div',{class:'dashboard-lower-grid'});
  const sessions=el('div',{class:'dashboard-list'});
  if (!data.recentSessions.length) sessions.append(el('p',{class:'muted',text:'هنوز تمرین ذخیره‌شده‌ای ندارید.'}));
  else data.recentSessions.forEach(item=>sessions.append(el('article',{class:'dashboard-row'},[
    el('strong',{text:item.title}),
    el('p',{class:'muted',text:(STAGES[item.stage]||item.stage)+' · '+(item.score===null?'بدون امتیاز ثبت‌شده':'امتیاز '+item.score+' از ۱۰۰')})
  ])));
  lower.append(section('تمرین‌های اخیر',sessions,{href:'#/moot-court',text:'رفتن به موت‌کورت'}));
  const deadlines=el('div',{class:'dashboard-list'});
  if (!data.upcomingDeadlines.length) deadlines.append(el('p',{class:'muted',text:'موعد باز و آینده‌ای در تقویم شما ثبت نشده است.'}));
  else data.upcomingDeadlines.forEach(item=>deadlines.append(el('article',{class:'dashboard-row'},[
    el('strong',{text:item.title}),el('p',{class:'muted',text:item.dueDate+' · '+(KINDS[item.kind]||KINDS.other)})
  ])));
  lower.append(section('موعدهای پیشِ رو',deadlines,{href:'#/deadlines',text:'مدیریت تقویم مواعد'}));
  wrap.append(lower,el('p',{class:'muted dashboard-data-note',text:'این گزارش بر اساس اطلاعات ثبت‌شده در حساب شما ساخته می‌شود؛ موعدها به‌صورت دستی وارد شده‌اند و محاسبهٔ خودکار مهلت قانونی نیستند.'}));
  return wrap;
}
