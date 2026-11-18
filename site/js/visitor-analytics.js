import { getJson } from './api.js';

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
const faDate = (value) => value ? new Date(value).toLocaleString('fa-IR') : '—';

export async function visitorAnalyticsPage() {
  const root = el('section', { class: 'admin-visitor-analytics' }, [
    el('div', { class: 'section-heading' }, [
      el('div', {}, [el('span', { class: 'section-kicker', text: 'مرکز کنترل سایت' }), el('h1', { text: 'پایش زنده بازدیدکنندگان' }), el('p', { class: 'muted', text: 'اطلاعات فنی نشست‌های بازدید؛ به‌روزرسانی خودکار هر ۳۰ ثانیه.' })]),
      el('button', { class: 'btn secondary', type: 'button', text: 'به‌روزرسانی' }),
    ]),
  ]);
  const refresh = root.querySelector('button');
  const status = el('p', { class: 'form-status', role: 'status', text: 'در حال دریافت آمار…' });
  const metrics = el('div', { class: 'cards dashboard-metrics' });
  const onlineList = el('div', { class: 'admin-event-table-wrap' });
  const popular = el('div', { class: 'admin-event-table-wrap' });
  root.append(status, metrics, el('h2', { text: 'بازدیدکنندگان آنلاین (فعال در ۲ دقیقهٔ اخیر)' }), onlineList, el('h2', { text: 'صفحات پربازدید در ۷ روز اخیر' }), popular);
  async function load() {
    refresh.disabled = true;
    const response = await getJson('/api/admin/analytics/overview');
    refresh.disabled = false;
    if (!response.ok) {
      status.textContent = response.status === 403 ? 'این حساب دسترسی مدیر ندارد.' : response.status === 401 ? 'برای مشاهدهٔ این بخش وارد حساب مدیر شوید.' : 'دریافت آمار ناموفق بود؛ ممکن است migration هنوز اجرا نشده باشد.';
      return;
    }
    const d = response.data;
    status.textContent = 'آخرین به‌روزرسانی: ' + faDate(d.generatedAt);
    metrics.replaceChildren(
      ...[['آنلاین', (d.online || []).length],['بازدیدکنندهٔ یکتا امروز',d.today?.visitors || 0],['نشست امروز',d.today?.visits || 0],['بازدیدکنندهٔ یکتا در ۳۰ روز',d.last30Days?.visitors || 0]].map(([label,value]) => el('article',{class:'card dashboard-metric'},[el('p',{class:'muted',text:label}),el('p',{class:'dashboard-metric-value',text:String(value)})]))
    );
    const table = el('table', { class: 'admin-event-table' });
    table.append(el('thead',{},[el('tr',{},['کاربر','IP','صفحهٔ فعلی','دستگاه/مرورگر','شروع حضور','آخرین فعالیت','بازدید'].map(x=>el('th',{text:x})))]));
    const body = el('tbody');
    for (const item of d.online || []) {
      const logged = item.user_id ? (item.display_name || 'کاربر واردشده') : 'بازدیدکنندهٔ ناشناس';
      body.append(el('tr',{},[
        el('td',{text:logged}),el('td',{text:item.ip_address || 'ثبت نشده'}),el('td',{text:item.current_path || '/'}),
        el('td',{text:(item.user_agent || 'نامشخص').slice(0,90)}),el('td',{text:faDate(item.first_seen)}),
        el('td',{text:faDate(item.last_seen)}),el('td',{text:String(item.page_views || 1)})
      ]));
    }
    if (!body.children.length) body.append(el('tr',{},[el('td',{colspan:'7',text:'در دو دقیقهٔ اخیر بازدیدکنندهٔ فعالی ثبت نشده است.'})]));
    table.append(body); onlineList.replaceChildren(table);
    const pt = el('table',{class:'admin-event-table'});
    pt.append(el('thead',{},[el('tr',{},['مسیر صفحه','تعداد بازدید ثبت‌شده'].map(x=>el('th',{text:x})))]));
    const pb=el('tbody');
    for(const item of d.popularPages || []) pb.append(el('tr',{},[el('td',{text:item.current_path}),el('td',{text:String(item.views)})]));
    if(!pb.children.length) pb.append(el('tr',{},[el('td',{colspan:'2',text:'هنوز داده‌ای ثبت نشده است.'})]));
    pt.append(pb); popular.replaceChildren(pt);
  }
  refresh.addEventListener('click', load);
  await load();
  const timer = window.setInterval(load,30000);
  root.addEventListener('DOMNodeRemoved',()=>window.clearInterval(timer),{once:true});
  return root;
}
