// مسیریاب ساده بر پایهٔ hash و رندر صفحات با DOM امن.
import { NAV, VALUES, ABOUT_SECTIONS } from './pages.js?v=20261120-classroom-instructors-1';
import { formatShamsi } from './shamsi.js';
import { parseHash } from './route.js';
import { icon, mountIcons } from './icons.js';
import { ACADEMY_TOOLS } from './academy-tools.js';

/** بارگذاری ماژول‌های سنگین فقط وقتی بخش مربوط به صفحه نزدیک دید کاربر شد. */
const lazyObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const holder = entry.target;
        lazyObserver.unobserve(holder);
        const load = holder.__loadLazy;
        delete holder.__loadLazy;
        load?.();
      }
    }, { rootMargin: '480px 0px' })
  : null;

function lazy(fn, { defer = false, timeoutMs = 20000, placeholderMinHeight = '8rem' } = {}) {
  // رزرو فضا برای محتوای تنبل‌بارگذاری‌شونده مانع جابه‌جایی ناگهانی بخش‌های پایین صفحه می‌شود.
  const holder = h('div', { class: 'lazy-content-placeholder', style: `min-height: ${placeholderMinHeight}`, 'aria-busy': 'true' }, [h('p', { class: 'loading', role: 'status', text: 'در حال بارگذاری…' })]);
  let started = false;
  const load = () => {
    if (started) return;
    started = true;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('page_load_timeout')), timeoutMs);
    });
    Promise.race([Promise.resolve().then(fn), timeout])
      .then((node) => {
        holder.replaceChildren(node);
        holder.style.minHeight = '';
        holder.removeAttribute('aria-busy');
      })
      .catch(() => {
        holder.style.minHeight = '';
        holder.removeAttribute('aria-busy');
        started = false;
        const retry = h('button', { class: 'btn secondary', type: 'button', text: 'تلاش دوباره' });
        retry.addEventListener('click', load);
        holder.replaceChildren(h('div', { class: 'notice', role: 'alert' }, [
          h('p', { text: 'بارگذاری این بخش بیش از زمان معمول طول کشید یا کامل نشد.' }),
          retry,
        ]));
      })
      .finally(() => clearTimeout(timer));
  };
  // صفحات مقصد باید بلافاصله پس از ورود بارگذاری شوند؛ تعویق فقط برای
  // اجزای پایین صفحهٔ اصلی است که هنوز در دید کاربر قرار نگرفته‌اند.
  if (defer && lazyObserver) {
    holder.__loadLazy = load;
    lazyObserver.observe(holder);
  } else {
    load();
  }
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
    h('img', { class: 'hero-bg', src: 'assets/images/legal-hero.webp', alt: '', width: '1200', height: '400', loading: 'eager', fetchpriority: 'high', decoding: 'async' }),
    h('div', { class: 'hero-copy' }, [
      h('h1', { id: 'hero-title' }, [document.createTextNode('به '), h('span', { class: 'accent', text: 'آکادمی وکالت شهرام مختاری' }), document.createTextNode(' خوش آمدید')]),
      h('p', { class: 'hero-sub', text: 'مسیر حرفه‌ای شدن در وکالت؛ از آموزش تا تجربه' }),
      h('p', { class: 'hero-desc', text: 'با دوره‌های تخصصی، پرونده‌های شبیه‌سازی‌شده و تمرین‌های عملی، مهارت‌های خود را تقویت کنید و با اطمینان در مسیر حرفه‌ای وکالت گام بردارید.' }),
      h('a', { class: 'btn-gold', href: '#/academy/courses', text: 'مشاهدهٔ دوره‌ها ‹' }),
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
      h('span', { class: 'level-icon', 'aria-hidden': 'true' }, [icon('scale', { size: 30 })]),
      h('h2', { text: 'سطح مهارت فعلی' }),
      h('strong', { text: 'در مسیر یادگیری' }),
      h('a', { class: 'btn-outline-light', href: '#/dashboard', text: 'گزارش عملکرد' }),
    ]),
    h('a', { class: 'stat-card course-card', href: '#/academy/courses' }, [
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

  // میان‌برهای اصلی آکادمی در اولین رندر صفحهٔ خانه حاضرند؛
  // آن‌ها را به IntersectionObserver و اسکرول کاربر وابسته نمی‌کنیم.
  const quick = h('section', { class: 'quick-section', 'aria-label': 'ابزارهای آکادمی' }, [
    h('div', { class: 'quick-grid' }, ACADEMY_TOOLS.map((item) =>
      h('a', { class: 'quick-tile', href: item.href }, [
        h('span', { class: 'quick-icon', 'aria-hidden': 'true' }, [icon(item.icon, { size: 24 })]),
        h('span', { text: item.href === '#/community' ? 'تالار گفتگو' : item.title }),
      ]))),
  ]);

  const lower = h('section', { class: 'dashboard-lower' }, [
    h('article', { class: 'panel quote-panel' }, [
      h('div', { class: 'quote-image' }, [h('p', { text: 'وکیل موفق، فقط به قانون مسلط نیست؛ بلکه می‌داند چگونه از آن استفاده کند.' })]),
      h('h2', { class: 'block-title', text: 'به‌روز بمانید' }),
      h('p', { class: 'muted', text: 'مقاله‌ها، پادکست‌ها و نکته‌های کاربردی برای رشد حرفه‌ای.' }),
      h('a', { class: 'btn-pill', href: '#/media', text: 'رسانه و اندیشه' }),
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
      lazy(async () => { const { upcomingCard } = await import('./deadlines.js'); return upcomingCard(); }, { defer: true, placeholderMinHeight: '11rem' }),
    ]),
    lazy(async () => { const { shamsiCalendar } = await import('./calendar.js'); return shamsiCalendar({ onSelect: (iso) => { window.location.hash = `#/deadlines?date=${encodeURIComponent(iso)}`; } }); }, { defer: true, placeholderMinHeight: '22rem' }),
  ]);
  const profileSpot = h('section', { class: 'home-profile-spot', hidden: '' });
  fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then(async (response) => {
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(`profile request failed: ${response.status}`);
      const data = await response.json();
      if (!data?.ok || !data?.user) throw new Error('invalid profile response');
      return data.user;
    })
    .then((user) => {
      if (!user) return;
      const avatarUrl = user.profile?.avatarUrl;
      const placeholder = () => h('span', { class: 'home-profile-avatar home-profile-placeholder', text: '👤', 'aria-hidden': 'true' });
      const avatar = avatarUrl
        ? h('img', { class: 'home-profile-avatar', src: `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}v=${Date.now()}`, alt: 'تصویر پروفایل', decoding: 'async' })
        : placeholder();
      avatar.addEventListener?.('error', () => avatar.replaceWith(placeholder()), { once: true });
      profileSpot.replaceChildren(
        avatar,
        h('div', {}, [
          h('strong', { text: user.displayName || 'کاربر آکادمی' }),
          h('small', { text: 'عضو آکادمی وکالت شهرام مختاری' }),
        ]),
        h('a', { href: '#/account', text: 'مدیریت پروفایل' }),
      );
      profileSpot.hidden = false;

      // تصویر حساب در میان‌بر بالای سایت نیز نمایش داده می‌شود.
      const headerLink = document.querySelector('.avatar-link');
      if (headerLink) {
        if (avatarUrl) {
          const headerAvatar = h('img', {
            class: 'header-profile-avatar',
            src: `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}v=${Date.now()}`,
            alt: 'پروفایل من',
          });
          headerAvatar.addEventListener('error', () => headerAvatar.replaceWith(icon('user', { size: 22 })), { once: true });
          headerLink.replaceChildren(headerAvatar);
          headerLink.setAttribute('aria-label', 'پروفایل من');
        }
      }
    })
    .catch((error) => {
      // شکست دریافت پروفایل نباید رندر یا سایر بخش‌های صفحهٔ اصلی را مختل کند.
      console.warn('Home profile could not be loaded.', error);
    });
  root.append(profileSpot, hero, quick, calendarSection, stats, lower, cta);
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
    h('p', { class: 'lead', text: 'این بخش صرفاً برای دریافت پیشنهادها، انتقادها و گزارش ایرادهای فنی یا محتوایی آکادمی است.' }),
  ]);
  const holder = h('div');
  wrap.append(holder);
  holder.replaceChildren(lazy(async () => { const { mountContactForm } = await import('./contact.js'); const form = h('div'); mountContactForm(form); return form; }));
  wrap.append(h('div', { class: 'notice', role: 'note', text: 'توجه: آکادمی به پرسش‌های حقوقی اشخاص پاسخ نمی‌دهد، خدمات مشاوره حقوقی ارائه نمی‌کند و پرونده‌های شخصی را بررسی نمی‌کند. پیام‌های این بخش صرفاً به‌عنوان پیشنهاد یا بازخورد دریافت می‌شوند.' }));
  wrap.append(h('p', { class: 'muted' }, [
    document.createTextNode('یا مستقیماً به ایمیل '),
    h('a', { href: 'mailto:edu@mokhtari.ir', text: 'edu@mokhtari.ir' }),
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
  return lazy(async () => {
    const { loginForm, registerForm, accountPanel } = await import('./account.js');
    const wrap = h('div');
    const area = h('div', { role: 'region', 'aria-live': 'polite' });
    wrap.append(area);
    const showLogin = () => {
      area.replaceChildren(
        h('h1', { text: 'ورود به حساب' }),
        loginForm({ onSuccess: () => { window.location.hash = '#/account'; render(); } })
      );
    };
    const showRegister = () => {
      area.replaceChildren(h('h1', { text: 'ثبت‌نام' }), registerForm({ onLoginLink: showLogin }));
    };
    if (params.mode === 'register') { showRegister(); return wrap; }
    area.replaceChildren(h('p', { class: 'loading', text: 'در حال بررسی…' }));
    const panel = await accountPanel({ onLogout: () => render() });
    if (panel) area.replaceChildren(panel); else showLogin();
    return wrap;
  });
}

function pageVerify(params) {
  return lazy(async () => {
    const { verifyPanel } = await import('./account.js');
    return verifyPanel(params.token || '');
  });
}

const ROUTES = {
  '/': () => pageHome(),
  '/about': () => pageAbout(),
  '/contact': () => pageContact(),
  '/account': (params) => pageAccount(params),
  '/verify': (params) => pageVerify(params),
  '/academy': () => lazy(async () => (await import('./academy.js?v=20261119-media-nav-title-2')).academyList()),
  '/academy/courses': () => lazy(async () => (await import('./academy.js?v=20261119-media-nav-title-2')).academyCoursesPage()),
  '/courses': () => lazy(async () => (await import('./academy.js?v=20261119-media-nav-title-2')).academyCoursesPage()),
  '/academy/exams': () => lazy(async () => (await import('./academy.js?v=20261119-media-nav-title-2')).academyExamsPage()),
  '/academy/ekhtebar': () => lazy(async () => (await import('./ekhtebar.js')).ekhtebarPage()),
  '/dashboard': () => lazy(async () => (await import('./dashboard.js')).dashboardPage()),
  '/admin': () => lazy(async () => (await import('./admin.js?v=20261120-classroom-instructors-1')).adminPage()),
  '/classroom': () => lazy(async () => (await import('./classroom.js?v=20261120-classroom-instructors-1')).classroomPage()),
  '/classroom/guest': (params) => lazy(async () => (await import('./classroom.js?v=20261120-classroom-instructors-1')).classroomGuestPage(params)),
  '/admin/traffic': () => lazy(async () => (await import('./visitor-analytics.js')).visitorAnalyticsPage()),
  '/community': () => lazy(async () => (await import('./community.js?v=20261119-community-title-fix-4')).communityPage()),
  '/casework': () => lazy(async () => (await import('./casework.js?v=20261127-casework-1')).caseworkPage()),
  '/cases': () => lazy(async () => (await import('./cases.js')).casesPage()),
  '/moot-court': (params) => lazy(async () => (await import('./moot.js')).mootCourtPage(params)),
  '/assistant': () => lazy(async () => (await import('./assistant-forms.js?v=20261126-assistant-config-split-1')).assistantMenuPage()),
  '/assistant/documents': () => lazy(async () => (await import('./assistant-forms.js?v=20261126-assistant-config-split-1')).assistantDocumentsMenuPage()),
  '/assistant/consult': (params) => lazy(async () => (await import('./assistant.js?v=20261126-assistant-config-split-1')).assistantPage(params)),
  '/assistant/litigation': (params) => lazy(async () => (await import('./assistant.js?v=20261126-assistant-config-split-1')).assistantPage({ ...params, mode: 'litigation' })),
  '/assistant/research': (params) => lazy(async () => (await import('./assistant.js?v=20261126-assistant-config-split-1')).assistantPage({ ...params, mode: 'research' })),
  '/voice-typing': () => lazy(async () => (await import('./voice-typing.js')).voiceTypingPage()),
  '/assistant/history': () => lazy(async () => (await import('./assistant.js?v=20261126-assistant-config-split-1')).assistantHistoryPage()),
  '/moot-court/hearing': (params) => lazy(async () => (await import('./moot-ai.js?v=20261119-stop-speaker-1')).courtRoomPage(params)),
  '/moot-court/cases': (params) => lazy(async () => (await import('./moot-cases.js')).casePickerPage(params)),
  '/calculators': (params) => lazy(async () => (await import('./calc/page.js?v=20261125-rtl-legal-notes-2')).calculatorsPage(params)),
  '/calculators/regional': () => lazy(async () => (await import('./calc/page.js?v=20261125-rtl-legal-notes-2')).calculatorsPage({ tool: 'regional' })),
  '/calculators/court': () => lazy(async () => (await import('./calc/page.js?v=20261125-rtl-legal-notes-2')).calculatorsPage({ tool: 'court' })),
  '/calculators/attorney': () => lazy(async () => (await import('./calc/page.js?v=20261125-rtl-legal-notes-2')).calculatorsPage({ tool: 'attorney' })),
  '/calculators/delay': () => lazy(async () => (await import('./calc/page.js?v=20261125-rtl-legal-notes-2')).calculatorsPage({ tool: 'delay' })),
  '/media': () => lazy(async () => (await import('./media.js')).mediaHome()),
  '/laws': () => lazy(async () => (await import('./laws.js')).legalBankPage()),
  '/deadlines': (params) => lazy(async () => (await import('./deadlines.js')).deadlinesPage(params)),
};


/** دسترسی سریع موبایل: مسیرهای پرکاربرد در ابتدای هر صفحه. */
function mobileQuickAccess(path) {
  if (path === '/' || path === '/moot-court/hearing') return null;
  const calculatorLinks = [
    { icon: 'landmark', title: 'ارزش منطقه‌ای', href: '#/calculators/regional' },
    { icon: 'landmark', title: 'هزینه دادرسی', href: '#/calculators/court' },
    { icon: 'briefcase', title: 'حق‌الوکاله', href: '#/calculators/attorney' },
    { icon: 'calculator', title: 'تأخیر تأدیه', href: '#/calculators/delay' },
  ];
  const generalLinks = [
    { icon: 'graduation-cap', title: 'آکادمی', href: '#/academy' },
    { icon: 'scale', title: 'دستیار وکیل', href: '#/assistant' },
    { icon: 'calculator', title: 'محاسبه‌گرها', href: '#/calculators' },
    { icon: 'calendar', title: 'تقویم مواعد', href: '#/deadlines' },
    { icon: 'folder', title: 'مدیریت پرونده‌ها', href: '#/casework' },
    { icon: 'folder-open', title: 'بانک آموزشی', href: '#/cases' },
    { icon: 'mic', title: 'تایپ صوتی', href: '#/voice-typing' },
    { icon: 'newspaper', title: 'رسانه و اندیشه', href: '#/media' },
    { icon: 'scale', title: 'بانک قوانین', href: '#/laws' },
  ];
  const items = path.startsWith('/calculators/') || path === '/calculators'
    ? calculatorLinks
    : generalLinks;
  const nav = h('nav', { class: 'mobile-quick-access', 'aria-label': 'دسترسی سریع به ابزارها' });
  nav.append(h('span', { class: 'mobile-quick-access-label', text: 'دسترسی سریع' }));
  const list = h('div', { class: 'mobile-quick-access-list' });
  for (const item of items) {
    const link = h('a', { class: 'mobile-quick-access-item', href: item.href });
    if (item.href === `#${path}`) link.setAttribute('aria-current', 'page');
    link.append(
      h('span', { class: 'mobile-quick-access-icon', 'aria-hidden': 'true' }, [icon(item.icon, { size: 20 })]),
      h('span', { class: 'mobile-quick-access-title', text: item.title }),
    );
    list.append(link);
  }
  nav.append(list);
  return nav;
}

function render() {
  const { path, params } = currentRoute();
  renderNav(path);
  nav.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');

  let content;
  const planned = NAV.find((n) => n.path === path && n.status === 'planned');
  if (ROUTES[path]) content = ROUTES[path](params);
  else if (path.startsWith('/assistant/doc/')) content = lazy(async () => (await import('./assistant-forms.js?v=20261126-assistant-config-split-1')).assistantDocumentPage({ type: decodeURIComponent(path.slice('/assistant/doc/'.length)) }));
  else if (path.startsWith('/casework/')) content = lazy(async () => (await import('./casework.js?v=20261127-casework-1')).caseworkDetailPage(decodeURIComponent(path.slice('/casework/'.length))));
  else if (path.startsWith('/cases/')) content = lazy(async () => (await import('./cases.js')).casesPage(decodeURIComponent(path.slice('/cases/'.length))));
  else if (path.startsWith('/media/')) content = lazy(async () => (await import('./media.js')).articlePage(decodeURIComponent(path.slice('/media/'.length))));
  else if (path.startsWith('/academy/')) content = lazy(async () => (await import('./academy.js?v=20261119-media-nav-title-2')).academyCourse(decodeURIComponent(path.slice('/academy/'.length))));
  else if (planned) content = pagePlanned(planned);
  else content = pageNotFound();

  document.body.classList.toggle('immersive', path === '/moot-court/hearing');
  const quickAccess = mobileQuickAccess(path);
  main.replaceChildren(...(quickAccess ? [quickAccess, content] : [content]));
  const EXTRA_TITLES = { '/assistant/consult': 'مشاوره حقوقی', '/community': 'تالار گفتگو', '/admin': 'مدیریت محتوا', '/admin/traffic': 'پایش زنده بازدیدکنندگان', '/dashboard': 'داشبورد من', '/verify': 'تأیید ایمیل', '/moot-court': 'موت کورت', '/cases': 'بانک پرونده‌های آموزشی', '/casework': 'مدیریت پرونده‌ها', '/laws': 'بانک قوانین و مقررات', '/assistant': 'دستیار هوشمند وکیل', '/assistant/documents': 'تنظیم اسناد', '/assistant/history': 'سوابق گفت‌وگوهای دستیار', '/academy/courses': 'دوره‌های آموزشی', '/courses': 'دوره‌های آموزشی', '/academy/exams': 'مرکز آزمون هوشمند', '/moot-court/hearing': 'اتاق دادگاه', '/moot-court/cases': 'انتخاب پرونده' };
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

// ابزارهای تشخیصی پس از آماده‌شدن رابط اصلی و به‌صورت جداگانه بارگذاری می‌شوند.
import('./diagnostics.js').then(({ installDiagnostics }) => installDiagnostics()).catch(() => {});
import('./visitor-tracking.js').then(({ installVisitorTracking }) => installVisitorTracking()).catch(() => {});
mountIcons();
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
    { title: 'رسانه و اندیشه', path: '/media' },
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

// The footer copyright is static; keep legacy year hook optional so it cannot block initial rendering.
const footerYear = document.getElementById('year');
if (footerYear) footerYear.textContent = formatShamsi(new Date()).split(' ').pop();
window.addEventListener('hashchange', render);
render();
