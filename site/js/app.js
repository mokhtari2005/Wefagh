// مسیریاب ساده بر پایهٔ hash و رندر صفحات با DOM امن.
import { NAV, VALUES, ABOUT_SECTIONS } from './pages.js';
import { mountContactForm } from './contact.js';
import { formatShamsi } from './shamsi.js';
import { parseHash } from './route.js';
import { loginForm, registerForm, verifyPanel, accountPanel } from './account.js';
import { academyList, academyCourse } from './academy.js';
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

const MODULES = [
  { title: 'آکادمی مجازی وکالت', desc: 'دوره‌های کوتاه و کارگاه‌های عملی برای دانشجویان حقوق، کارآموزان و وکلا.', href: '#/academy', cta: 'ورود به آکادمی' },
  { title: 'موت‌کورت و تمرین دادرسی', desc: 'تمرین مرحله‌ای روی پرونده‌های فرضی آموزشی، با چک‌لیست خودارزیابی.', href: '#/moot-court', cta: 'شروع تمرین' },
  { title: 'میز ابزارهای حقوقی', desc: 'محاسبه‌گرهای منبع‌دار. نتیجهٔ هر ابزار وضعیت احراز خود را نشان می‌دهد.', href: '#/calculators', cta: 'باز کردن ابزارها' },
  { title: 'رسانه و پادکست', desc: 'یادداشت‌های حقوقی و قسمت‌های «شنبه‌ها با وِفاق».', href: '#/media', cta: 'مطالب و پادکست' },
  { title: 'تقویم مواعد', desc: 'یادآوری مهلت‌های دادرسی با تاریخ شمسی؛ نتیجه پیش از تأیید قطعی نیست.', href: '#/deadlines', cta: 'تقویم مواعد' },
  { title: 'عضویت و شبکهٔ اعضا', desc: 'ورود، ثبت‌نام و دسترسی به امکانات ویژهٔ اعضا.', href: '#/account', cta: 'ورود یا عضویت' },
];

function pageHome() {
  const root = h('div', { class: 'home-dashboard' });
  const hero = h('section', { class: 'dashboard-hero', 'aria-labelledby': 'hero-title' }, [
    h('div', { class: 'dashboard-hero-copy' }, [
      h('span', { class: 'section-kicker', text: 'آکادمی علمی حقوقی وفاق' }),
      h('h1', { id: 'hero-title' }, [document.createTextNode('به آکادمی '), h('span', { text: 'وفاق' }), document.createTextNode(' خوش آمدید')]),
      h('p', { text: 'مسیر حرفه‌ای شدن در وکالت؛ از آموزش تا تجربه. با دوره‌های تخصصی، پرونده‌های شبیه‌سازی‌شده و تمرین‌های عملی، مهارت‌های خود را تقویت کنید.' }),
      h('a', { class: 'btn-link hero-button', href: '#/academy', text: 'مشاهدهٔ دوره‌ها ←' }),
    ]),
  ]);

  const metrics = h('section', { class: 'dashboard-overview', 'aria-label': 'نمای کلی پیشرفت' }, [
    h('article', { class: 'overview-card progress-card' }, [
      h('div', { class: 'progress-ring', 'aria-label': 'پیشرفت نمونه ۶۸ درصد' }, [h('span', { text: '۶۸٪' })]),
      h('div', {}, [h('h2', { text: 'پیشرفت کلی شما' }), h('p', { text: 'مسیر تبدیل شدن به یک وکیل حرفه‌ای' }), h('div', { class: 'progress-track', role: 'progressbar', 'aria-valuenow': '68', 'aria-valuemin': '0', 'aria-valuemax': '100' }, [h('span')]), h('small', { text: 'برای مشاهدهٔ پیشرفت واقعی وارد حساب خود شوید.' })]),
    ]),
    h('article', { class: 'overview-card skill-card' }, [h('span', { class: 'feature-icon', text: '⚖' }), h('h2', { text: 'سطح مهارت فعلی' }), h('strong', { text: 'در مسیر یادگیری' }), h('a', { href: '#/dashboard', text: 'گزارش عملکرد ←' })]),
    h('a', { class: 'overview-card course-card', href: '#/academy' }, [h('span', { class: 'mini-label', text: 'شروع مسیر یادگیری' }), h('span', { class: 'feature-icon', text: '◎' }), h('h2', { text: 'دوره‌های کاربردی حقوقی' }), h('p', { text: 'آموزش مرحله‌به‌مرحله با تمرین‌های عملی' }), h('span', { class: 'card-cta', text: 'ادامهٔ یادگیری ←' })]),
    h('a', { class: 'overview-card practice-card', href: '#/moot-court' }, [h('span', { class: 'mini-label', text: 'تمرین پیشنهادی' }), h('h2', { text: 'موت‌کورت و دفاع شفاهی' }), h('p', { text: 'پروندهٔ آموزشی را بررسی کنید و از موضع خود دفاع کنید.' }), h('span', { class: 'card-cta', text: 'شروع تمرین ←' })]),
  ]);

  const quick = h('section', { class: 'quick-section' }, [h('div', { class: 'section-heading' }, [h('div', {}, [h('span', { class: 'section-kicker', text: 'یادگیری در عمل' }), h('h2', { text: 'دسترسی سریع به کارگاه‌ها' })]), h('a', { href: '#/academy', text: 'همهٔ بخش‌ها ←' })])]);
  const quickItems = [
    ['🎓', 'دوره‌های آموزشی', '#/academy'], ['📚', 'بانک پرونده‌ها', '#/cases'], ['🎙', 'موت‌کورت صوتی', '#/moot-court'], ['🗓', 'تقویم مواعد', '#/deadlines'], ['🧮', 'ابزارهای حقوقی', '#/calculators'], ['🤝', 'مهارت مذاکره', '#/academy'], ['🛡', 'اخلاق حرفه‌ای', '#/academy'], ['☷', 'آزمون مهارتی', '#/dashboard'],
  ];
  const quickGrid = h('div', { class: 'quick-grid' });
  quickItems.forEach(([icon, title, href]) => quickGrid.append(h('a', { class: 'quick-tile', href }, [h('span', { class: 'quick-icon', text: icon }), h('span', { text: title })])));
  quick.append(quickGrid);

  const lower = h('section', { class: 'dashboard-lower' }, [
    h('article', { class: 'panel deadline-panel' }, [h('div', { class: 'section-heading' }, [h('h2', { text: 'موعدهای پیش‌رو' }), h('a', { href: '#/deadlines', text: 'مشاهدهٔ تقویم ←' })]), lazy(upcomingCard)]),
    h('article', { class: 'panel quote-panel' }, [h('div', { class: 'quote-image' }, [h('p', { text: 'وکیل موفق، فقط به قانون مسلط نیست؛ بلکه می‌داند چگونه از آن استفاده کند.' })]), h('h2', { text: 'به‌روز بمانید' }), h('p', { text: 'مقاله‌ها، پادکست‌ها و نکته‌های کاربردی برای رشد حرفه‌ای.' }), h('a', { class: 'btn-link', href: '#/media', text: 'مطالعهٔ مطالب وفاق ←' })]),
  ]);
  const cta = h('section', { class: 'learning-cta' }, [h('div', {}, [h('h2', { text: 'به سوی آینده‌ای روشن در مسیر وکالت' }), h('p', { text: 'با آکادمی وفاق، دانش، مهارت و اعتمادبه‌نفس را هم‌زمان تجربه کنید.' })]), h('a', { class: 'btn-link secondary', href: '#/account', text: 'شروع مسیر آموزشی ←' })]);
  root.append(hero, metrics, quick, lower, cta);
  return root;
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
  '/moot-court': () => mootCourtPage(),
  '/calculators': () => calculatorsPage(),
  '/media': () => lazy(mediaHome),
  '/deadlines': () => lazy(deadlinesPage),
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

  main.replaceChildren(content);
  const EXTRA_TITLES = { '/admin': 'مدیریت محتوا', '/dashboard': 'داشبورد من', '/verify': 'تأیید ایمیل', '/moot-court': 'موت کورت', '/cases': 'بانک پرونده‌ها' };
  const navTitle = NAV.find((n) => n.path === path)?.title;
  const title = navTitle ?? EXTRA_TITLES[path] ?? (path.startsWith('/academy/') ? 'آکادمی' : 'صفحه پیدا نشد');
  document.title = `${title} | وِفاق`;
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
    notice.textContent = 'بخش مستقیمی با این عبارت پیدا نشد؛ از منوی وفاق یکی از بخش‌ها را انتخاب کنید.';
    searchForm.insertAdjacentElement('afterend', notice);
  }
});

document.getElementById('year').textContent = formatShamsi(new Date()).split(' ').pop();
window.addEventListener('hashchange', render);
render();
