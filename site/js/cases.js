// بانک پرونده‌های فرضی آموزشی؛ محتوای API با textContent در DOM درج می‌شود.
import { getJson } from './api.js';

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

export async function casesPage(caseId = '') {
  const wrap = h('div', {}, [
    h('span', { class: 'section-kicker', text: 'کارگاه تحلیل پرونده' }),
    h('h1', { text: 'بانک پرونده‌های آموزشی' }),
    h('p', { class: 'lead', text: 'پرونده‌های کاملاً فرضی برای تمرین تشخیص مسئله، ارزیابی دلیل و طراحی راهبرد. این محتوا جایگزین بررسی منابع معتبر یا مشاورهٔ حقوقی نیست.' }),
  ]);
  const response = await getJson(caseId ? `/api/cases/${encodeURIComponent(caseId)}` : '/api/cases');
  if (!response.ok) {
    wrap.append(h('p', { class: 'form-status err', role: 'alert', text: response.status === 404 ? 'پرونده پیدا نشد.' : 'دریافت بانک پرونده‌ها ناموفق بود.' }));
    wrap.append(h('p', {}, [h('a', { href: '#/cases', text: 'نمایش همهٔ پرونده‌ها' })]));
    return wrap;
  }
  if (!caseId) {
    const grid = h('div', { class: 'cards' });
    for (const item of response.data.cases) {
      grid.append(h('a', { class: 'card', href: `#/cases/${item.id}` }, [
        h('span', { class: 'badge', text: `${item.area} · ${item.level}` }),
        h('h2', { text: item.title }), h('p', { text: item.summary }),
        h('p', { class: 'muted', text: `${item.issueCount} مسئلهٔ قابل تحلیل` }),
      ]));
    }
    wrap.append(grid);
    return wrap;
  }
  const item = response.data.case;
  wrap.append(h('p', { class: 'muted', text: `${item.area} · سطح ${item.level}` }), h('h2', { text: 'شرح وقایع' }));
  const facts = h('ol'); item.facts.forEach((fact) => facts.append(h('li', { text: fact })));
  wrap.append(facts, h('h2', { text: 'مسائل برای تحلیل' }));
  const issues = h('div', { class: 'lessons' });
  item.issues.forEach((issue, index) => issues.append(h('article', { class: 'lesson' }, [h('h3', { text: `${index + 1}. ${issue.text}` })])));
  wrap.append(issues, h('h2', { text: 'مدارک بالقوهٔ مرتبط' }));
  const evidence = h('ul'); item.evidence.forEach((e) => evidence.append(h('li', { text: e })));
  wrap.append(evidence, h('div', { class: 'notice', role: 'note', text: 'این فهرست صرفاً نقطهٔ شروع بررسی است؛ ارتباط، اصالت، کفایت و آثار هر دلیل باید مستقل ارزیابی شود.' }));
  wrap.append(h('div', { class: 'row' }, [h('a', { class: 'btn secondary', href: '#/cases', text: 'بازگشت به بانک پرونده‌ها' }), h('a', { class: 'btn', href: '#/moot-court', text: 'رفتن به تمرین موت‌کورت' })]));
  return wrap;
}
