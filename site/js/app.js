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
  const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-title' }, [
    h('div', {}, [
      h('span', { class: 'section-kicker', text: 'وِفاق · گروه وکلای مدافع فرهنگ، اندیشه و قانون' }),
      h('h1', { id: 'hero-title' }, [
        document.createTextNode('دانش حقوقی، '),
        h('span', { class: 'hero-title-accent', text: 'گفت‌وگو' }),
        document.createTextNode(' و کنش حرفه‌ای'),
      ]),
      h('p', { class: 'lead', text: 'آموزش، رسانه، تمرین دادرسی و ابزارهای حقوقی؛ برای شهروندان و اهالی حقوق.' }),
      h('div', { class: 'hero-actions' }, [
        h('a', { class: 'btn-link', href: '#/academy', text: 'ورود به دنیای وِفاق' }),
        h('a', { class: 'btn-link secondary', href: '#/calculators', text: 'استفاده از ابزارهای حقوقی' }),
      ]),
      h('p', { class: 'muted', text: `امروز: ${formatShamsi(new Date())}` }),
    ]),
    heroArt(),
  ]);

  const modules = h('div', { class: 'modules' });
  MODULES.forEach((m, i) => {
    modules.append(h('a', { class: 'module', href: m.href }, [
      h('span', { class: 'module-index', text: String(i + 1).padStart(2, '۰').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) }),
      h('h3', { class: 'module-title', text: m.title }),
      h('p', { class: 'module-desc', text: m.desc }),
      h('span', { class: 'module-cta', text: `${m.cta} ←` }),
    ]));
  });
  const navSection = h('section', {}, [
    h('span', { class: 'section-kicker', text: 'از کجا شروع کنیم' }),
    h('h2', { text: 'شش مسیر، یک گفت‌وگو' }),
    modules,
  ]);

  const deadlinesSection = h('section', {}, [lazy(upcomingCard)]);

  const editorial = h('div', { class: 'editorial' });
  for (const v of VALUES) {
    editorial.append(h('div', { class: 'editorial-item' }, [h('h3', { text: v.title }), h('p', { text: v.text })]));
  }
  const valuesSection = h('section', {}, [h('h2', { text: 'ارزش‌های ما' }), editorial]);

  const cta = h('section', { class: 'cta-band', 'aria-labelledby': 'cta-title' }, [
    h('div', {}, [
      h('h2', { id: 'cta-title', text: 'به وِفاق بپیوندید' }),
      h('p', { text: 'عضویت برای ادامهٔ آموزش، ذخیرهٔ پیشرفت و دسترسی به امکانات اعضا.' }),
    ]),
    h('div', { class: 'row' }, [
      h('a', { class: 'btn', href: '#/account', text: 'ثبت‌نام یا ورود' }),
      h('a', { class: 'btn secondary light', href: '#/contact', text: 'تماس با ما' }),
    ]),
  ]);

  return h('div', {}, [hero, navSection, deadlinesSection, valuesSection, cta]);
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
  else if (path.startsWith('/media/')) content = lazy(() => articlePage(decodeURIComponent(path.slice('/media/'.length))));
  else if (path.startsWith('/academy/')) content = lazy(() => academyCourse(decodeURIComponent(path.slice('/academy/'.length))));
  else if (planned) content = pagePlanned(planned);
  else content = pageNotFound();

  main.replaceChildren(content);
  const EXTRA_TITLES = { '/verify': 'تأیید ایمیل', '/moot-court': 'موت کورت' };
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

document.getElementById('year').textContent = formatShamsi(new Date()).split(' ').pop();
window.addEventListener('hashchange', render);
render();
