import { getJson } from './api.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}
const faDate = (value) => value ? new Date(value).toLocaleString('fa-IR') : '—';
const number = (value) => Number(value || 0).toLocaleString('fa-IR');
function deviceType(ua = '') {
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return 'موبایل';
  if (/Windows|Macintosh|Linux|X11/i.test(ua)) return 'رایانه';
  return 'نامشخص';
}
function browserType(ua = '') {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'مرورگر نامشخص';
}
function donut(title, entries, total) {
  const card = el('section', { class: 'va-panel va-chart-panel' });
  card.append(el('div', { class: 'va-panel-heading' }, [el('h2', { text: title }), el('span', { class: 'va-chart-total', text: number(total) })]));
  const sum = entries.reduce((n, item) => n + item.value, 0);
  let cursor = 0;
  const stops = entries.map((item) => {
    const start = sum ? cursor / sum * 100 : 0;
    cursor += item.value;
    const end = sum ? cursor / sum * 100 : 0;
    return `${item.color} ${start}% ${end}%`;
  });
  const ring = el('div', { class: 'va-donut', role: 'img', 'aria-label': title + ': ' + entries.map(x => x.label + ' ' + x.value).join('، '), style: `background:${sum ? `conic-gradient(${stops.join(',')})` : '#e8ecea'}` });
  ring.append(el('div', { class: 'va-donut-hole' }, [el('strong', { text: number(total) }), el('span', { text: 'مورد' })]));
  const legend = el('ul', { class: 'va-legend' });
  entries.forEach(item => legend.append(el('li', {}, [el('span', { class: 'va-legend-dot', style: `background:${item.color}` }), el('span', { text: item.label }), el('strong', { text: number(item.value) })])));
  card.append(el('div', { class: 'va-donut-layout' }, [ring, legend]));
  return card;
}
function metric(label, value, note, icon) {
  return el('article', { class: 'va-metric' }, [
    el('span', { class: 'va-metric-icon', 'aria-hidden': 'true', text: icon }),
    el('div', { class: 'va-metric-copy' }, [el('span', { class: 'va-muted', text: label }), el('strong', { class: 'va-metric-value', text: number(value) }), el('small', { text: note })])
  ]);
}

export async function visitorAnalyticsPage() {
  const root = el('section', { class: 'admin-visitor-analytics' });
  const header = el('header', { class: 'va-header' }, [
    el('div', {}, [el('span', { class: 'va-kicker', text: 'مرکز کنترل آکادمی' }), el('h1', { text: 'پایش زنده بازدیدکنندگان' }), el('p', { text: 'نمای کلی ترافیک سایت و فعالیت نشست‌ها؛ آمار به‌صورت خودکار هر ۳۰ ثانیه تازه می‌شود.' })]),
    el('button', { class: 'btn secondary va-refresh', type: 'button' }, [el('span', { text: '↻' }), el('span', { text: 'به‌روزرسانی' })])
  ]);
  const status = el('div', { class: 'va-status', role: 'status', text: 'در حال دریافت آمار…' });
  const metrics = el('div', { class: 'va-metrics' });
  const charts = el('div', { class: 'va-charts' });
  const membersPanel = el('section', { class: 'va-panel va-members-panel' });
  const onlinePanel = el('section', { class: 'va-panel va-online-panel' });
  const popularPanel = el('section', { class: 'va-panel va-popular-panel' });
  root.append(header, status, metrics, charts, membersPanel, onlinePanel, popularPanel);

  async function load() {
    const button = header.querySelector('button');
    button.disabled = true;
    status.textContent = 'در حال به‌روزرسانی اطلاعات…';
    try {
      const response = await getJson('/api/admin/analytics/overview');
      if (!response.ok) {
        status.textContent = response.status === 403 ? 'این حساب دسترسی مدیر ندارد.' : response.status === 401 ? 'برای مشاهدهٔ این بخش وارد حساب مدیر شوید.' : 'دریافت آمار ناموفق بود؛ وضعیت سرویس و migration را بررسی کنید.';
        status.dataset.state = 'error';
        return;
      }
      const d = response.data || {};
      const online = d.online || [];
      const today = d.today || {};
      const last30 = d.last30Days || {};
      status.dataset.state = 'ok';
      status.textContent = '●  اطلاعات به‌روز است  ·  آخرین دریافت: ' + faDate(d.generatedAt);
      metrics.replaceChildren(
        metric('بازدیدکنندهٔ آنلاین', online.length, 'فعال در ۲ دقیقهٔ اخیر', '◉'),
        metric('بازدیدکنندهٔ یکتای امروز', today.visitors, 'بر اساس نشست‌های ثبت‌شده', '♙'),
        metric('نشست‌های امروز', today.visits, 'شروع نشست در امروز', '↗'),
        metric('بازدیدکنندهٔ ۳۰ روز اخیر', last30.visitors, 'کاربران یکتای ثبت‌شده', '▦')
      );
      const logged = online.filter(x => Boolean(x.user_id)).length;
      const anonymous = online.length - logged;
      const academyMembers = online.filter(x => Boolean(x.user_id));
      membersPanel.replaceChildren(el('div', { class: 'va-panel-heading' }, [
        el('div', {}, [el('h2', { text: 'اعضای آکادمی آنلاین' }), el('p', { class: 'va-muted', text: 'اعضایی که با حساب کاربری خود وارد شده‌اند و در دو دقیقهٔ اخیر فعال بوده‌اند' })]),
        el('span', { class: 'va-live-count', text: number(academyMembers.length) + ' عضو آنلاین' })
      ]));
      if (!academyMembers.length) {
        membersPanel.append(el('div', { class: 'va-empty', text: 'در حال حاضر عضو واردشده و فعالی ثبت نشده است.' }));
      } else {
        const memberList = el('div', { class: 'va-member-list' });
        academyMembers.forEach(member => memberList.append(el('article', { class: 'va-member-card' }, [
          el('span', { class: 'va-member-avatar', text: String(member.display_name || 'ع').trim().slice(0, 1) }),
          el('div', { class: 'va-member-info' }, [
            el('strong', { text: member.display_name || 'عضو آکادمی' }),
            el('span', { text: 'آنلاین · ' + (member.current_path || '/') })
          ]),
          el('span', { class: 'va-member-pulse', text: 'فعال' })
        ])));
        membersPanel.append(memberList);
      }
      const mobile = online.filter(x => deviceType(x.user_agent) === 'موبایل').length;
      const desktop = online.filter(x => deviceType(x.user_agent) === 'رایانه').length;
      const unknown = online.length - mobile - desktop;
      charts.replaceChildren(
        donut('ترکیب کاربران آنلاین', [{label:'واردشده',value:logged,color:'#1c7768'},{label:'ناشناس',value:anonymous,color:'#d1a653'}], online.length),
        donut('نوع دستگاه کاربران آنلاین', [{label:'موبایل',value:mobile,color:'#3978a8'},{label:'رایانه',value:desktop,color:'#1c7768'},{label:'نامشخص',value:unknown,color:'#c5cdd0'}], online.length)
      );

      onlinePanel.replaceChildren(el('div', { class: 'va-panel-heading' }, [
        el('div', {}, [el('h2', { text: 'بازدیدکنندگان آنلاین' }), el('p', { class: 'va-muted', text: 'نشست‌هایی که در دو دقیقهٔ اخیر فعالیت داشته‌اند' })]),
        el('span', { class: 'va-live-count', text: number(online.length) + ' آنلاین' })
      ]));
      if (!online.length) {
        onlinePanel.append(el('div', { class: 'va-empty', text: 'در دو دقیقهٔ اخیر بازدیدکنندهٔ فعالی ثبت نشده است.' }));
      } else {
        const wrap = el('div', { class: 'va-table-wrap' });
        const table = el('table', { class: 'va-table' });
        table.append(el('thead', {}, [el('tr', {}, ['کاربر','IP','صفحهٔ فعلی','دستگاه / مرورگر','شروع حضور','آخرین فعالیت','بازدید'].map(x => el('th', { text: x })))]));
        const body = el('tbody');
        online.forEach(item => {
          const ua = item.user_agent || '';
          const name = item.user_id ? (item.display_name || 'کاربر واردشده') : 'بازدیدکنندهٔ ناشناس';
          const values = [name,item.ip_address || 'ثبت نشده',item.current_path || '/',deviceType(ua) + ' · ' + browserType(ua),faDate(item.first_seen),faDate(item.last_seen),number(item.page_views || 1)];
          body.append(el('tr', {}, values.map((value, i) => el('td', { 'data-label': ['کاربر','IP','صفحهٔ فعلی','دستگاه / مرورگر','شروع حضور','آخرین فعالیت','بازدید'][i], text: value }))));
        });
        table.append(body); wrap.append(table); onlinePanel.append(wrap);
      }

      const pages = d.popularPages || [];
      popularPanel.replaceChildren(el('div', { class: 'va-panel-heading' }, [
        el('div', {}, [el('h2', { text: 'صفحات پربازدید' }), el('p', { class: 'va-muted', text: 'مجموع بازدیدهای ثبت‌شده در ۷ روز اخیر' })])
      ]));
      if (!pages.length) popularPanel.append(el('div', { class: 'va-empty', text: 'هنوز داده‌ای برای رتبه‌بندی صفحات ثبت نشده است.' }));
      else {
        const max = Math.max(...pages.map(x => Number(x.views) || 0), 1);
        const list = el('div', { class: 'va-page-rankings' });
        pages.forEach((item, i) => {
          const count = Number(item.views) || 0;
          const track = el('div', { class: 'va-bar-track' }, [el('span', { class: 'va-bar-fill', style: `width:${Math.max(2,count / max * 100)}%` })]);
          list.append(el('div', { class: 'va-page-row' }, [
            el('div', { class: 'va-page-label' }, [el('span', { class: 'va-rank', text: number(i + 1) }), el('code', { text: item.current_path || '/' }), el('strong', { text: number(count) + ' بازدید' })]),
            track
          ]));
        });
        popularPanel.append(list);
      }
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'ارتباط با سرویس آمار برقرار نشد. اتصال شبکه را بررسی و دوباره تلاش کنید.';
    } finally {
      button.disabled = false;
    }
  }
  header.querySelector('button').addEventListener('click', load);
  await load();
  const timer = window.setInterval(() => { if (root.isConnected) load(); else window.clearInterval(timer); }, 30000);
  return root;
}
