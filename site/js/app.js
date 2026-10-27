// مسیریاب ساده بر پایهٔ hash و رندر صفحات با DOM امن.
import { NAV, VALUES, ABOUT_SECTIONS } from './pages.js';
import { mountContactForm } from './contact.js';
import { formatShamsi } from './shamsi.js';

const main = document.getElementById('main');
const nav = document.getElementById('site-nav');
const toggle = document.querySelector('.nav-toggle');

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

function currentRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function renderNav(activePath) {
  const list = h('ul');
  for (const item of NAV) {
    const link = h('a', { href: `#${item.path}`, text: item.title });
    if (item.path === activePath) link.setAttribute('aria-current', 'page');
    list.append(h('li', {}, [link]));
  }
  nav.replaceChildren(list);
}

function pageHome() {
  const hero = h('section', { class: 'hero' }, [
    h('h1', { text: 'وِفاق' }),
    h('p', { class: 'lead', text: 'گروه وکلای مدافع فرهنگ، اندیشه و قانون' }),
    h('p', { text: 'آموزش حقوقی، مشاوره، رسانه و ابزارهای کاربردی برای شهروندان و اهالی حقوق.' }),
    h('p', { class: 'muted', text: `امروز: ${formatShamsi(new Date())}` }),
  ]);

  const cards = h('div', { class: 'cards' });
  for (const item of NAV.filter((n) => n.path !== '/')) {
    const badge = item.status === 'planned' ? h('span', { class: 'badge', text: `به‌زودی · فاز ${item.phase}` }) : null;
    const card = h('a', { class: 'card', href: `#${item.path}` }, [
      ...(badge ? [badge] : []),
      h('h3', { text: item.title }),
    ]);
    cards.append(card);
  }

  const values = h('section', {}, [h('h2', { text: 'ارزش‌های ما' })]);
  const valuesGrid = h('div', { class: 'cards' });
  for (const v of VALUES) {
    valuesGrid.append(h('div', { class: 'card' }, [h('h3', { text: v.title }), h('p', { text: v.text })]));
  }
  values.append(valuesGrid);

  return h('div', {}, [hero, h('h2', { text: 'بخش‌ها' }), cards, values]);
}

function pageAbout() {
  const wrap = h('div', {}, [h('h1', { text: 'درباره وِفاق' })]);
  for (const section of ABOUT_SECTIONS) {
    wrap.append(h('h2', { text: section.heading }));
    const p = h('p', { text: section.body });
    wrap.append(p);
    if (section.draft) {
      wrap.append(h('div', { class: 'notice', role: 'note', text: 'متن پیش‌نویس: پیش از انتشار باید تأیید شود.' }));
    }
  }
  return wrap;
}

function pageContact() {
  const wrap = h('div', {}, [
    h('h1', { text: 'تماس با ما' }),
    h('p', { class: 'lead', text: 'پرسش، مشاوره یا پیشنهاد خود را با ما در میان بگذارید.' }),
  ]);
  const holder = h('div');
  wrap.append(holder);
  mountContactForm(holder);
  wrap.append(h('p', { class: 'muted' }, [
    document.createTextNode('یا مستقیماً به ایمیل '),
    h('a', { href: 'mailto:Vefagh.lawyers@gmail.com', text: 'Vefagh.lawyers@gmail.com' }),
    document.createTextNode(' بنویسید.'),
  ]));
  return wrap;
}

function pagePlanned(item) {
  return h('div', {}, [
    h('h1', { text: item.title }),
    h('div', { class: 'notice', role: 'note', text: `این بخش در فاز ${item.phase} پیاده‌سازی می‌شود و هنوز فعال نیست.` }),
    h('p', {}, [h('a', { href: '#/', text: 'بازگشت به صفحهٔ اصلی' })]),
  ]);
}

function pageNotFound() {
  return h('div', {}, [
    h('h1', { text: 'صفحه پیدا نشد' }),
    h('p', {}, [h('a', { href: '#/', text: 'بازگشت به صفحهٔ اصلی' })]),
  ]);
}

const ROUTES = {
  '/': () => pageHome(),
  '/about': () => pageAbout(),
  '/contact': () => pageContact(),
};

function render() {
  const path = currentRoute();
  renderNav(path);
  nav.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');

  let content;
  const planned = NAV.find((n) => n.path === path && n.status === 'planned');
  if (ROUTES[path]) content = ROUTES[path]();
  else if (planned) content = pagePlanned(planned);
  else content = pageNotFound();

  main.replaceChildren(content);
  document.title = `${NAV.find((n) => n.path === path)?.title ?? 'صفحه پیدا نشد'} | وِفاق`;
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

document.getElementById('year').textContent = formatShamsi(new Date()).split(' ').pop();
window.addEventListener('hashchange', render);
render();
