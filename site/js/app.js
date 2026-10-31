// مسیریاب ساده بر پایهٔ hash و رندر صفحات با DOM امن.
import { NAV, VALUES, ABOUT_SECTIONS } from './pages.js';
import { mountContactForm } from './contact.js';
import { formatShamsi } from './shamsi.js';
import { parseHash } from './route.js';
import { loginForm, registerForm, verifyPanel, accountPanel } from './account.js';
import { academyList, academyCourse, ACADEMY_TOOLS } from './academy.js';
import { shamsiCalendar } from './calendar.js';
import { assistantPage } from './assistant.js';
import { courtRoomPage } from './moot-ai.js';
import { casePickerPage } from './moot-cases.js';
import { mootCourtPage } from './moot.js';
import { calculatorsPage } from './calc/page.js';
import { mediaHome, articlePage } from './media.js';
import { deadlinesPage, upcomingCard } from './deadlines.js';
import { casesPage } from './cases.js';
import { dashboardPage } from './dashboard.js';
import { adminPage } from './admin.js';

/** صفحه‌ای که داده‌اش ناهمگام است: یک جای نگه‌دار می‌سازد و بعد پر می‌کند. */
function lazy(fn) {
  const holder = h('div', {}, [h('p', { class: 'loading', role: 'status', text: 'در حال بارگذاری…' })]);
  Promise.resolve()
    .then(fn)
    .then((node) => holder.replaceChildren(node))
    .catch(() => holder.replaceChildren(h('p', { class: 'form-status err', role: 'alert', text: 'بارگذاری صفحه ناموفق بود.' })));
  return holder;
}

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
  return parseHash(location.hash);
}

function renderNav(activePath) {
  const list = h('ul');
  for (const item of NAV) {
    if (item.status === 'planned') continue; // صفحه‌های برنامه‌ریزی‌شده در ناوبری نمایش داده نمی‌شوند
    const link = h('a', { href: `#${item.path}`, text: item.title });
    if (item.path === activePath) link.setAttribute('aria-current', 'page');
    list.append(h('li', {}, [link]));
  }
  nav.replaceChildren(list);
  document.querySelectorAll('[data-bottom-route]').forEach((link) => {
    if (link.getAttribute('data-bottom-route') === activePath) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

/** تصویر شاخص صفحهٔ اصلی: ترکیب هندسی از ترازو، خطوط گفت‌وگو و گره‌های دانش. */
function heroArt() {
  return svgEl('svg', { class: 'hero-art', viewBox: '0 0 400 400', role: 'img', 'aria-label': 'نقش انتزاعی از ترازو و خطوط پیوند' }, [
    svgEl('circle', { cx: '200', cy: '200', r: '150', class: 'stroke' }),
    svgEl('circle', { cx: '200', cy: '200', r: '105', class: 'stroke' }),
    svgEl('circle', { cx: '200', cy: '200', r: '62', class: 'soft' }),
    svgEl('path', { d: 'M90 190 H310', class: 'stroke', 'stroke-width': '2.5' }),
    svgEl('path', { d: 'M200 110 V300', class: 'stroke', 'stroke-width': '2.5' }),
    svgEl('path', { d: 'M90 190 Q120 260 150 190', class: 'stroke' }),
    svgEl('path', { d: 'M250 190 Q280 260 310 190', class: 'stroke' }),
    svgEl('path', { d: 'M140 300 H260', class: 'stroke', 'stroke-width': '2.5' }),
    svgEl('circle', { cx: '90', cy: '190', r: '7', class: 'gold' }),
    svgEl('circle', { cx: '310', cy: '190', r: '7', class: 'gold' }),
    svgEl('circle', { cx: '200', cy: '110', r: '6', class: 'teal' }),
    svgEl('circle', { cx: '200', cy: '300', r: '6', class: 'teal' }),
    svgEl('path', { d: 'M200 110 L330 60 M200 300 L70 340', class: 'stroke', 'stroke-dasharray': '4 6' }),
    svgEl('circle', { cx: '330', cy: '60', r: '5', class: 'gold' }),
    svgEl('circle', { cx: '70', cy: '340', r: '5', class: 'gold' }),
  ]);
}

function pageHome() {
  const root = h('div', { class: 'home-dashboard' });

  const hero = h('section', { class: 'hero-banner', 'aria-labelledby': 'hero-title' }, [
    h('img', { class: 'hero-bg', src: 'assets/images/legal-hero.webp', alt: '', width: '1200', height: '400', loading: 'eager' }),
    h('div', { class: 'hero-copy' }, [
      h('h1', { id: 'hero-title' }, [document.createTextNode('به '), h('span', { class: 'accent', text: 'آکادمی وکالت شهرام مختاری' }), document.createTextNode(' خوش آمدید')]),
      h('p', { class: 'hero-sub', text: 'مسیر حرفه‌ای شدن در وکالت؛ از آموزش تا تجربه' }),
      h('p', { class: 'hero-desc', text: 'با دوره‌های تخصصی، پرونده‌های شبیه‌سازی‌شده و تمرین‌های عملی، مهارت‌های خود را تقویت کنید و با اطمینان در مسیر حرفه‌ای وکالت گام بردارید.' }),
      h('a', { class: 'btn-gold', href: '#/academy', text: 'مشاهدهٔ دوره‌ها ‹' }),
    ]),
  ]);

  const stats = h('section', { class: 'stat-row', 'aria-label': 'نمای کلی پیشرفت' }, [
    h('article', { class: 'stat-card progress-card' }, [
      h('div', { class: 'progress-ring', role: 'img', 'aria-label': 'پیشرفت نمونه ۶۸ درصد' }, [h('span', { text: '۶۸٪' })]),
      h('div', {}, [
        h('h2', { text: 'پیشرفت کلی شما' }),
        h('p', { class: 'muted', text: 'مسیر تبدیل شدن به یک وکیل حرفه‌ای' }),
        h('small', { class: 'sample-note', text: 'نمونه؛ پیشرفت واقعی پس از ورود نمایش داده می‌شود.' }),
      ]),
    ]),
    h('article', { class: 'stat-card level-card' }, [
      h('span', { class: 'level-icon', 'aria-hidden': 'true', text: '⚖' }),
      h('h2', { text: 'سطح مهارت فعلی' }),
      h('strong', { text: 'در مسیر یادگیری' }),
      h('a', { class: 'btn-outline-light', href: '#/dashboard', text: 'گزارش عملکرد' }),
    ]),
    h('a', { class: 'stat-card course-card', href: '#/academy' }, [
      h('span', { class: 'mini-label', text: 'دوره‌های آموزشی' }),
      h('h2', { text: 'آموزش کاربردی حقوقی' }),
      h('p', { class: 'muted', text: 'آموزش مرحله‌به‌مرحله با تمرین‌های عملی' }),
      h('span', { class: 'btn-pill', text: 'ادامهٔ یادگیری' }),
    ]),
    h('a', { class: 'stat-card practice-card', href: '#/moot-court' }, [
      h('span', { class: 'mini-label', text: 'تمرین پیشنهادی' }),
      h('h2', { text: 'موت‌کورت و دفاع شفاهی' }),
      h('p', { class: 'muted', text: 'پروندهٔ آموزشی فرضی را بررسی کنید و از موضع خود دفاع کنید.' }),
      h('span', { class: 'btn-pill', text: 'شروع تمرین' }),
    ]),
  ]);

  const quick = h('section', { class: 'quick-section', 'aria-labelledby': 'quick-title' }, [
    h('h2', { id: 'quick-title', class: 'block-title', text: 'دسترسی سریع' }),
    h('div', { class: 'quick-grid' }, ACADEMY_TOOLS.map((item) =>
      h('a', { class: 'quick-tile', href: item.href }, [h('span', { class: 'quick-icon', 'aria-hidden': 'true', text: item.icon }), h('span', { text: item.title })]))),
  ]);

  const lower = h('section', { class: 'dashboard-lower' }, [
    h('article', { class: 'panel quote-panel' }, [
      h('div', { class: 'quote-image' }, [h('p', { text: 'وکیل موفق، فقط به قانون مسلط نیست؛ بلکه می‌داند چگونه از آن استفاده کند.' })]),
      h('h2', { class: 'block-title', text: 'به‌روز بمانید' }),
      h('p', { class: 'muted', text: 'مقاله‌ها، پادکست‌ها و نکته‌های کاربردی برای رشد حرفه‌ای.' }),
      h('a', { class: 'btn-pill', href: '#/media', text: 'مطالعهٔ مطالب آکادمی' }),
    ]),
  ]);

  const cta = h('section', { class: 'learning-cta' }, [
    h('img', { class: 'cta-bg', src: 'assets/images/legal-hero.webp', alt: '', width: '1200', height: '400', loading: 'lazy' }),
    h('div', { class: 'cta-copy' }, [
      h('h2', { text: 'به سوی آینده‌ای روشن در مسیر وکالت' }),
      h('p', { text: 'با آکادمی وکالت شهرام مختاری، دانش، مهارت و اعتمادبه‌نفس را هم‌زمان تجربه کنید.' }),
    ]),
    h('a', { class: 'btn-outline-light cta-button', href: '#/account', text: 'شروع مسیر آموزشی ‹' }),
  ]);

  // تقویم و مواعد پیش‌رو بلافاصله زیر بنر اصلی قرار می‌گیرند.
  const calendarSection = h('section', { class: 'home-calendar', 'aria-label': 'تقویم و مواعد پیش‌رو' }, [
    h('article', { class: 'panel deadline-panel' }, [
      h('div', { class: 'section-heading' }, [h('h2', { class: 'block-title', text: 'موعدهای پیش‌رو' }), h('a', { href: '#/deadlines', text: 'مشاهدهٔ تقویم کامل ‹' })]),
      lazy(upcomingCard),
    ]),
    shamsiCalendar({ onSelect: (iso) => { window.location.hash = `#/deadlines?date=${encodeURIComponent(iso)}`; } }),
  ]);
  root.append(hero, calendarSection, quick, stats, lower, cta);
  return root;
}

function pageAbout() {
  const wrap = h('div', {}, [h('h1', { text: 'درباره آکادمی وکالت شهرام مختاری' })]);
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

function pageAccount(params) {
  const wrap = h('div');
  const area = h('div', { role: 'region', 'aria-live': 'polite' });
  wrap.append(area);

  const showLogin = () => {
    area.replaceChildren(
      h('h1', { text: 'ورود به حساب' }),
      loginForm({
        onSuccess: () => {
          // بعد از ورود، صفحهٔ حساب را دوباره می‌سازیم.
          window.location.hash = '#/account';
          render();
        },
      })
    );
  };
  const showRegister = () => {
    area.replaceChildren(h('h1', { text: 'ثبت‌نام' }), registerForm({ onLoginLink: showLogin }));
  };

  if (params.mode === 'register') {
    showRegister();
    return wrap;
  }

  // اگر کاربر وارد است، حساب او را نشان بده؛ وگرنه فرم ورود.
  area.replaceChildren(h('p', { class: 'loading', text: 'در حال بررسی…' }));
  accountPanel({
    onLogout: () => {
      render();
    },
  }).then((panel) => {
    if (panel) {
      area.replaceChildren(panel);
    } else {
      showLogin();
    }
  });
  return wrap;
}

function pageVerify(params) {
  const holder = h('div');
  verifyPanel(params.token || '').then((panel) => holder.replaceChildren(panel));
  return holder;
}

const ROUTES = {
  '/': () => pageHome(),
  '/about': () => pageAbout(),
  '/contact': () => pageContact(),
  '/account': (params) => pageAccount(params),
  '/verify': (params) => pageVerify(params),
  '/academy': () => lazy(academyList),
  '/dashboard': () => lazy(dashboardPage),
  '/admin': () => lazy(adminPage),
  '/cases': () => lazy(() => casesPage()),
  '/moot-court': (params) => lazy(() => mootCourtPage(params)),
  '/assistant': () => assistantPage(),
  '/moot-court/hearing': (params) => courtRoomPage(params),
  '/moot-court/cases': (params) => casePickerPage(params),
  '/calculators': (params) => calculatorsPage(params),
  '/calculators/court': () => calculatorsPage({ tool: 'court' }),
  '/calculators/attorney': () => calculatorsPage({ tool: 'attorney' }),
  '/calculators/delay': () => calculatorsPage({ tool: 'delay' }),
  '/media': () => lazy(mediaHome),
  '/deadlines': (params) => lazy(() => deadlinesPage(params)),
};

function render() {
  const { path, params } = currentRoute();
  renderNav(path);
  nav.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');

  let content;
  const planned = NAV.find((n) => n.path === path && n.status === 'planned');
  if (ROUTES[path]) content = ROUTES[path](params);
  else if (path.startsWith('/cases/')) content = lazy(() => casesPage(decodeURIComponent(path.slice('/cases/'.length))));
  else if (path.startsWith('/media/')) content = lazy(() => articlePage(decodeURIComponent(path.slice('/media/'.length))));
  else if (path.startsWith('/academy/')) content = lazy(() => academyCourse(decodeURIComponent(path.slice('/academy/'.length))));
  else if (planned) content = pagePlanned(planned);
  else content = pageNotFound();

  document.body.classList.toggle('immersive', path === '/moot-court/hearing');
  main.replaceChildren(content);
  const EXTRA_TITLES = { '/admin': 'مدیریت محتوا', '/dashboard': 'داشبورد من', '/verify': 'تأیید ایمیل', '/moot-court': 'موت کورت', '/cases': 'بانک پرونده‌ها', '/assistant': 'دستیار هوشمند وکیل', '/moot-court/hearing': 'اتاق دادگاه', '/moot-court/cases': 'انتخاب پرونده' };
  const navTitle = NAV.find((n) => n.path === path)?.title;
  const title = navTitle ?? EXTRA_TITLES[path] ?? (path.startsWith('/academy/') ? 'آکادمی' : 'صفحه پیدا نشد');
  document.title = `${title} | آکادمی وکالت شهرام مختاری`;
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

const bottomMore = document.getElementById('bottom-more');
bottomMore?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle?.setAttribute('aria-expanded', String(open));
  if (open) nav.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

const searchForm = document.getElementById('global-search');
const searchInput = document.getElementById('global-search-input');
searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = (searchInput?.value || '').trim().toLocaleLowerCase('fa');
  if (!query) return;
  const candidates = [
    ...NAV.map((item) => ({ title: item.title, path: item.path })),
    { title: 'موت‌کورت و تمرین دادرسی', path: '/moot-court' },
    { title: 'تمرین دادرسی', path: '/moot-court' },
    { title: 'مقاله‌ها و پادکست‌ها', path: '/media' },
    { title: 'تمرین‌ها و عملکرد من', path: '/dashboard' },
  ];
  const match = candidates.find((item) => item.title.toLocaleLowerCase('fa').includes(query))
    || candidates.find((item) => query.includes(item.title.toLocaleLowerCase('fa')));
  if (match) location.hash = `#${match.path}`;
  else {
    const notice = document.getElementById('search-feedback') || document.createElement('p');
    notice.id = 'search-feedback';
    notice.className = 'search-feedback';
    notice.setAttribute('role', 'status');
    notice.textContent = 'بخش مستقیمی با این عبارت پیدا نشد؛ از منوی آکادمی یکی از بخش‌ها را انتخاب کنید.';
    searchForm.insertAdjacentElement('afterend', notice);
  }
});

document.getElementById('year').textContent = formatShamsi(new Date()).split(' ').pop();
window.addEventListener('hashchange', render);
render();
