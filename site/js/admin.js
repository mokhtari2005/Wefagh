// رابط مدیریت محتوا برای مدیران؛ تمام داده‌ها با textContent در DOM درج می‌شوند.
import { getJson, postJson, sendJson } from './api.js';

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
function field(labelText, name, value = '', type = 'text', required = true) {
  const label = el('label', { class: 'admin-field' }, [el('span', { text: labelText })]);
  const control = type === 'textarea' ? el('textarea', { name, rows: name === 'summary' ? '3' : '6', required: String(required) }) : el('input', { name, type, required: String(required) });
  control.value = value;
  label.append(control);
  return label;
}
function lineList(items = []) { return items.join('\n'); }
function parseLines(value) { return value.split('\n').map((x) => x.trim()).filter(Boolean); }
function errorText(data, status) {
  if (status === 401) return 'برای مدیریت محتوا ابتدا وارد حساب کاربری شوید.';
  if (status === 403) return 'این حساب نقش مدیر ندارد. دسترسی مدیریت فقط از طریق نقش مدیر مجاز است.';
  if (data?.error === 'DUPLICATE_LAW') return 'این شناسه قبلاً برای یک قانون ثبت شده است.';
  if (data?.error === 'DUPLICATE_RELATION') return 'این رابطه حقوقی قبلاً ثبت شده است.';
  if (data?.error === 'STATUS_EVIDENCE_REQUIRED') return 'برای ثبت اصلاح یا نسخ، توضیح و مشخصات منبع را وارد کنید.';
  if (data?.error === 'INVALID_SOURCE_URL') return 'نشانی منبع باید با https شروع شود.';
  if (data?.error === 'DUPLICATE_SLUG') return 'این شناسه قبلاً برای همین نوع محتوا استفاده شده است.';
  if (data?.error === 'UNPUBLISH_BEFORE_DELETE') return 'ابتدا محتوا را از انتشار خارج کنید و سپس آن را حذف کنید.';
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  return 'عملیات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
}

export async function adminPage() {
  const wrap = el('div', {}, [
    el('span', { class: 'section-kicker', text: 'ویژهٔ مدیران مجاز' }),
    el('h1', { text: 'پنل مدیریت محتوا' }),
    el('p', { class: 'lead', text: 'از منوی مدیریت، بخش موردنیاز را انتخاب کنید. نمای اصلی فقط گزارش کلی و وضعیت بخش‌ها را نمایش می‌دهد.' }),
  ]);
  const notice = el('p', { class: 'form-status', role: 'status' });
  const list = el('div', { class: 'admin-content-list' });
  const form = el('form', { class: 'admin-form card' });
  let editingId = null;
  let currentItems = [];
  const select = el('select', { name: 'kind', required: 'true', 'aria-label': 'نوع محتوا' }, [
    el('option', { value: 'course', text: 'دورهٔ آموزشی' }),
    el('option', { value: 'case', text: 'پروندهٔ آموزشی' }),
  ]);
  const statusSelect = el('select', { name: 'status', required: 'true', 'aria-label': 'وضعیت انتشار' }, [
    el('option', { value: 'draft', text: 'پیش‌نویس' }), el('option', { value: 'published', text: 'منتشرشده' }),
  ]);
  const kindLabel = el('label', { class: 'admin-field' }, [el('span', { text: 'نوع محتوا' }), select]);
  const statusLabel = el('label', { class: 'admin-field' }, [el('span', { text: 'وضعیت' }), statusSelect]);
  const slugField = field('شناسهٔ انگلیسی (مانند contract-basics)', 'slug');
  const titleField = field('عنوان', 'title');
  const summaryField = field('خلاصه (۱۰ تا ۵۰۰ نویسه)', 'summary', '', 'textarea');
  const levelField = field('سطح (مثلاً مقدماتی)', 'level', 'مقدماتی');
  const areaField = field('حوزهٔ پرونده (مثلاً قراردادها)', 'area', 'قراردادها');
  const lessonsField = field('درس‌ها؛ هر خط با قالب شناسه|عنوان|متن درس (حداقل ۲۰ نویسه)', 'lessons', '', 'textarea');
  const factsField = field('وقایع پرونده؛ هر خط یک واقعه', 'facts', '', 'textarea');
  const issuesField = field('مسائل؛ هر خط با قالب شناسه|صورت مسئله', 'issues', '', 'textarea');
  const evidenceField = field('مدارک بالقوه؛ هر خط یک مدرک', 'evidence', '', 'textarea');
  // پروندهٔ بانک به‌صورت کامل (JSON) ویرایش می‌شود تا هیچ بخشی (شاهد، رأی، استنادها) از دست نرود.
  const caseJsonField = field('پروندهٔ کامل بانک (JSON مطابق ساختار بانک پرونده‌ها؛ شناسه باید با slug یکسان باشد)', 'caseJson', '', 'textarea');
  caseJsonField.querySelector('textarea').rows = 18;
  caseJsonField.querySelector('textarea').spellcheck = false;
  const submit = el('button', { class: 'btn', type: 'submit', text: 'ذخیرهٔ محتوا' });
  const cancel = el('button', { class: 'btn secondary', type: 'button', text: 'لغو ویرایش' });
  cancel.hidden = true;
  const formActions = el('div', { class: 'row' }, [submit, cancel]);
  form.append(kindLabel, slugField, titleField, summaryField, statusLabel, levelField, lessonsField, areaField, factsField, issuesField, evidenceField, caseJsonField, formActions);
  // بارگذاری دوره‌های داخلی و بانک پرونده‌ها به‌صورت پیش‌نویس؛ هیچ‌کدام منتشر نمی‌شوند.
  const importNotice = el('p', { class: 'form-status', role: 'status' });
  const importStatus = el('p', { class: 'muted', role: 'status' });
  async function refreshImportStatus() {
    const r = await getJson('/api/admin/cases/status');
    if (!r.ok) { importStatus.textContent = ''; return; }
    const d = r.data;
    importStatus.textContent = `بانک: ${d.bankTotal} پرونده · در پایگاه داده: ${d.dbTotal} · پیش‌نویس: ${d.counts.draft || 0} · منتشرشده: ${d.counts.published || 0} · استناد تأییدشده: ${d.verifiedRefs} · سالم: ${d.intact}${d.missing.length ? ` · ناقص: ${d.missing.length}` : ''}`;
  }
  const importCourses = el('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری دوره‌های داخلی (پیش‌نویس)' });
  importCourses.addEventListener('click', async () => {
    const r = await postJson('/api/admin/courses/import-builtin', {});
    importNotice.className = `form-status${r.ok ? '' : ' err'}`;
    importNotice.textContent = r.ok ? `دوره‌ها: ${r.data.inserted} افزوده، ${r.data.skippedExisting} موجود (بدون بازنویسی).` : errorText(r.data, r.status);
    if (r.ok) await refresh();
  });
  const importCases = el('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری سناریوهای فرضی بانک تمرین' });
  importCases.addEventListener('click', async () => {
    
    const r = await postJson('/api/admin/cases/import', {});
    importNotice.className = `form-status${r.ok ? '' : ' err'}`;
    importNotice.textContent = r.ok ? `پرونده‌ها: ${r.data.inserted} افزوده، ${r.data.skippedExisting} موجود (بدون بازنویسی).` : errorText(r.data, r.status);
    if (r.ok) { await refresh(); await refreshImportStatus(); }
  });
  const importPanel = el('section', { class: 'admin-import card' }, [
    el('h2', { text: 'بارگذاری محتوای داخلی' }),
    el('p', { class: 'muted', text: 'بانک شامل سناریوهای فرضی تمرین دادرسی است، نه متن رأی واقعی. این سناریوها با برچسب آموزشی منتشر می‌شوند؛ استنادهای بررسی‌نشده بدون شماره ماده نمایش داده می‌شوند. هفت دورهٔ تکمیلی آکادمی نیز در فهرست عمومی فعال‌اند.' }),
    el('div', { class: 'row' }, [importCourses, importCases]),
    importStatus,
    importNotice,
  ]);
  // تشخیص مسیر واقعی ارسال ایمیل Resend و وضعیت حساب ثبت‌نامی برای مدیر مجاز.
  const mailNotice = el('p', { class: 'form-status', role: 'status' });
  const mailCheck = el('button', { class: 'btn secondary', type: 'button', text: 'بررسی تنظیمات Resend' });
  mailCheck.addEventListener('click', async () => {
    mailNotice.className = 'form-status';
    mailNotice.textContent = 'در حال بررسی…';
    const r = await getJson('/api/admin/mail/status');
    if (!r.ok) { mailNotice.className = 'form-status err'; mailNotice.textContent = errorText(r.data, r.status); return; }
    const d = r.data;
    const bad = !d.configured;
    mailNotice.className = `form-status${bad ? ' err' : ' ok'}`;
    mailNotice.textContent = bad
      ? `مشکل ایمیل: ${d.hint || d.probe?.hint || 'نامشخص'}`
      : `کلید Resend در Worker تنظیم شده است. برای بررسی واقعی ارسال، ایمیل آزمایشی بفرستید. آدرس پایهٔ لینک‌ها: ${d.baseUrl}`;
  });
  const mailTest = el('button', { class: 'btn secondary', type: 'button', text: 'آزمون واقعی ارسال با Resend' });
  mailTest.addEventListener('click', async () => {
    mailNotice.className = 'form-status';
    mailNotice.textContent = 'در حال ارسال…';
    const r = await postJson('/api/admin/mail/test', {});
    mailNotice.className = `form-status${r.ok ? ' ok' : ' err'}`;
    mailNotice.textContent = r.ok ? 'ارسال آزمایشی از طریق Resend پذیرفته شد؛ صندوق ورودی و Spam را بررسی کنید.' : `ارسال ناموفق: ${r.data?.hint || errorText(r.data, r.status)}`;
  });
  const accountEmail = el('input', { type: 'email', dir: 'ltr', placeholder: 'نشانی ایمیل کاربر', 'aria-label': 'ایمیل برای بررسی وضعیت ثبت‌نام' });
  const accountCheck = el('button', { class: 'btn secondary', type: 'button', text: 'بررسی وضعیت حساب' });
  const accountResend = el('button', { class: 'btn secondary', type: 'button', text: 'ارسال مجدد لینک تأیید' });
  accountResend.disabled = true;
  const accountNotice = el('p', { class: 'form-status', role: 'status' });
  accountCheck.addEventListener('click', async () => {
    accountResend.disabled = true;
    accountNotice.className = 'form-status';
    accountNotice.textContent = 'در حال بررسی وضعیت حساب…';
    const r = await postJson('/api/admin/mail/account-status', { email: accountEmail.value.trim() });
    if (!r.ok) {
      accountNotice.className = 'form-status err';
      accountNotice.textContent = errorText(r.data, r.status);
      return;
    }
    const d = r.data;
    if (!d.found) {
      accountNotice.className = 'form-status';
      accountNotice.textContent = 'برای این نشانی حسابی پیدا نشد؛ ثبت‌نام جدید باید انجام شود.';
      return;
    }
    if (d.verified) {
      accountNotice.className = 'form-status ok';
      accountNotice.textContent = 'حساب وجود دارد و ایمیل آن تأیید شده است؛ ثبت‌نام مجدد لازم نیست.';
      return;
    }
    if (d.status !== 'active') {
      accountNotice.className = 'form-status err';
      accountNotice.textContent = 'حساب پیدا شد، اما وضعیت آن فعال نیست؛ بررسی مدیریتی لازم است.';
      return;
    }
    accountNotice.className = `form-status${d.resendAllowed ? '' : ' err'}`;
    accountNotice.textContent = d.resendAllowed
      ? 'حساب ساخته شده، اما ایمیل هنوز تأیید نشده است. می‌توانید لینک تازه بفرستید.'
      : `حساب ساخته شده و تأیید نشده است؛ برای ارسال مجدد ${d.retryAfterSeconds} ثانیه صبر کنید.`;
    accountResend.disabled = !d.resendAllowed;
  });
  accountResend.addEventListener('click', async () => {
    accountResend.disabled = true;
    accountNotice.className = 'form-status';
    accountNotice.textContent = 'در حال ارسال لینک تأیید…';
    const r = await postJson('/api/admin/mail/account-resend', { email: accountEmail.value.trim() });
    accountNotice.className = `form-status${r.ok ? ' ok' : ' err'}`;
    accountNotice.textContent = r.ok
      ? 'درخواست ارسال لینک تأیید به Resend تحویل شد. دریافت ایمیل را با کاربر بررسی کنید.'
      : (r.data?.error === 'RESEND_COOLDOWN' ? `برای ارسال مجدد ${r.data.retryAfterSeconds} ثانیه صبر کنید.` : (r.data?.hint || errorText(r.data, r.status)));
  });
  const aiNotice = el('p', { class: 'form-status', role: 'status' });
  const aiCheck = el('button', { class: 'btn secondary', type: 'button', text: 'بررسی سرویس هوش مصنوعی' });
  aiCheck.addEventListener('click', async () => {
    aiNotice.className = 'form-status';
    aiNotice.textContent = 'در حال بررسی مدل‌ها…';
    const r = await getJson('/api/admin/ai/status');
    if (!r.ok) { aiNotice.className = 'form-status err'; aiNotice.textContent = errorText(r.data, r.status); return; }
    const lines = (r.data.models || []).map((m) => `${m.role} (${m.model}): ${m.hint}${m.httpStatus ? ` [HTTP ${m.httpStatus}${m.reason ? ` ${m.reason}` : ''}]` : ''}${m.ms ? ` · ${m.ms}ms` : ''}`);
    const g = r.data.groq;
    if (g) lines.push(`بازبین Groq: ${g.hint}${g.httpStatus ? ` [HTTP ${g.httpStatus}]` : ''}${g.ms ? ` · ${g.ms}ms` : ''}${g.models ? ` · ${g.models.map((m) => `${m.id}: ${m.available ? 'موجود' : 'نامشخص'}`).join('، ')}` : ''}`);
    const bad = !r.data.configured || (r.data.models || []).every((m) => !m.ok);
    aiNotice.className = `form-status${bad ? ' err' : ' ok'}`;
    aiNotice.textContent = r.data.configured ? lines.join(' | ') : `GEMINI_API_KEY در Worker تعریف نشده است.${g ? ` | بازبین Groq: ${g.hint}` : ''}`;
  });
  const mailPanel = el('section', { class: 'admin-mail card' }, [
    el('h2', { text: 'تشخیص ارسال ایمیل' }),
    el('p', { class: 'muted', text: 'اگر ایمیل تأیید ثبت‌نام نمی‌رسد، از این‌جا علت را ببینید. مقدار Secretها هرگز نمایش داده نمی‌شود.' }),
    el('div', { class: 'row' }, [mailCheck, mailTest]),
    mailNotice,
    el('h3', { text: 'بررسی ثبت‌نام یک کاربر' }),
    el('p', { class: 'muted', text: 'این بررسی فقط برای مدیران مجاز است و وجود حساب، وضعیت تأیید ایمیل و امکان ارسال مجدد را نشان می‌دهد.' }),
    el('div', { class: 'row' }, [accountEmail, accountCheck, accountResend]),
    accountNotice,
    el('h2', { text: 'تشخیص هوش مصنوعی' }),
    el('div', { class: 'row' }, [aiCheck]),
    aiNotice,
  ]);
  // جست‌وجو در فهرست محتوا (عنوان، شناسه، وضعیت)
  const search = el('input', { type: 'search', placeholder: 'جست‌وجو در عنوان، شناسه یا وضعیت', 'aria-label': 'جست‌وجو در محتوا' });
  search.addEventListener('input', () => {
    const q = search.value.trim();
    for (const row of list.children) row.hidden = Boolean(q) && !(row.dataset.search || '').includes(q);
  });
  // مدیریت اعضا: درخواست‌ها، فهرست کاربران و ثبت‌نام دستی.
  const membersNotice = el('p', { class: 'form-status', role: 'status' });
  const pushNotice = el('p', { class: 'form-status', role: 'status' });
  const pushEnable = el('button', { class: 'btn secondary', type: 'button', text: 'فعال‌سازی اعلان ثبت‌نام روی این دستگاه' });
  function decodePushKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  }
  pushEnable.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      pushNotice.className = 'form-status err';
      pushNotice.textContent = 'این محیط مرورگر از سرویس‌ورکر یا اعلان پشتیبانی نمی‌کند. سایت را مستقیماً در Safari یا مرورگر اصلی دستگاه باز کنید.';
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isIos && !installed) {
      pushNotice.className = 'form-status err';
      pushNotice.textContent = 'برای دریافت اعلان در آیفون، ابتدا در Safari گزینهٔ Add to Home Screen را بزنید و سایت را از آیکون صفحهٔ اصلی باز کنید.';
      return;
    }
    pushEnable.disabled = true;
    pushNotice.className = 'form-status';
    pushNotice.textContent = 'در حال فعال‌سازی اعلان‌ها…';
    try {
      const keyResult = await getJson('/api/push/public-key');
      if (!keyResult.ok || !keyResult.data?.publicKey) throw new Error('کلید اعلان در سرور تنظیم نشده است.');
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'اجازهٔ اعلان در تنظیمات مرورگر مسدود شده است.' : 'اجازهٔ ارسال اعلان داده نشد.');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const readyRegistration = await navigator.serviceWorker.ready;
      const pushManager = readyRegistration.pushManager || registration.pushManager;
      if (!pushManager || typeof pushManager.subscribe !== 'function') {
        throw new Error('قابلیت اعلان در این مرورگر فعال نیست. در آیفون، سایت را از Safari به صفحهٔ اصلی اضافه کنید و آن را از همان آیکون باز کنید؛ در سایر دستگاه‌ها از مرورگر اصلی استفاده کنید.');
      }
      let subscription = await pushManager.getSubscription();
      if (!subscription) subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePushKey(keyResult.data.publicKey),
      });
      const saved = await postJson('/api/push/subscription', subscription.toJSON());
      if (!saved.ok) throw new Error('ثبت اشتراک اعلان در حساب مدیریتی انجام نشد.');
      pushNotice.className = 'form-status ok';
      pushNotice.textContent = 'اعلان ثبت‌نام برای این دستگاه فعال شد. از این پس با ثبت درخواست جدید، پیام فوری دریافت می‌کنید.';
      pushEnable.textContent = 'اعلان ثبت‌نام فعال است';
    } catch (error) {
      pushNotice.className = 'form-status err';
      pushNotice.textContent = error?.message || 'فعال‌سازی اعلان ناموفق بود؛ دوباره تلاش کنید.';
    } finally {
      pushEnable.disabled = false;
    }
  });
  const membersList = el('div', { class: 'admin-content-list' });
  const membersSearch = el('input', { type: 'search', placeholder: 'جست‌وجو بر اساس نام، ایمیل یا شماره عضویت', 'aria-label': 'جست‌وجوی اعضا' });
  const rejectedMembersList = el('div', { class: 'admin-content-list' });
  const rejectedMembersSearch = el('input', { type: 'search', placeholder: 'جست‌وجو در درخواست‌های ردشده', 'aria-label': 'جست‌وجو در درخواست‌های ردشده' });
  const manualMemberForm = el('form', { class: 'admin-form card' });
  const manualName = field('نام و نام خانوادگی', 'memberName');
  const manualEmail = field('ایمیل', 'memberEmail', '', 'email');
  const manualTitle = field('عنوان حرفه‌ای (اختیاری)', 'memberTitle', '', 'text', false);
  const manualPosition = field('سمت (اختیاری)', 'memberPosition', '', 'text', false);
  const manualPassword = field('رمز عبور موقت (حداقل مطابق سیاست رمز عبور)', 'memberPassword', '', 'password');
  const manualSubmit = el('button', { class: 'btn', type: 'submit', text: 'ثبت عضو و ارسال ایمیل تأیید' });
  manualMemberForm.append(manualName, manualEmail, manualTitle, manualPosition, manualPassword, manualSubmit);
  function renderMembers(items, targetList = membersList, searchInput = membersSearch) {
    targetList.replaceChildren();
    const q = searchInput.value.trim().toLocaleLowerCase();
    const filtered = items.filter(x => !q || [x.displayName,x.email,x.membershipNo,x.mobile].some(v => String(v || '').toLocaleLowerCase().includes(q)));
    if (!filtered.length) { targetList.append(el('p', { class: 'muted', text: 'عضوی با این مشخصات پیدا نشد.' })); return; }
    for (const item of filtered) {
      const statusLabel = item.membershipStatus === 'pending' ? 'در انتظار تأیید' : item.membershipStatus === 'approved' ? 'عضویت تأییدشده' : 'درخواست ردشده';
      const row = el('article', { class: 'admin-content-row card' }, [
        el('div', {}, [
          el('span', { class: 'badge', text: statusLabel }),
          el('h3', { text: item.displayName }),
          el('p', { class: 'muted', text: item.email + ' · ' + (item.membershipNo || 'بدون شماره عضویت') }),
          el('p', { class: 'muted', text: [item.gender === 'male' ? 'آقا' : item.gender === 'female' ? 'خانم' : '',({lawyer:'وکیل دادگستری',trainee:'کارآموز وکالت',law_student:'دانشجوی حقوق',law_graduate:'فارغ‌التحصیل حقوق',professor:'استاد دانشگاه',researcher:'پژوهشگر حقوق',other:'سایر'})[item.position] || item.position,({academy_member:'عضو آکادمی',academy_instructor:'مدرس آکادمی',academy_researcher:'پژوهشگر آکادمی',guest_member:'عضو مهمان',other:'سایر'})[item.professionalTitle] || item.professionalTitle,item.mobile,item.city,item.province].filter(Boolean).join(' · ') || 'اطلاعات تکمیلی ثبت نشده' }),
          el('p', { class: 'muted', text: (item.emailVerifiedAt ? 'ایمیل تأیید شده' : 'ایمیل تأیید نشده') + ' · ثبت‌نام: ' + new Date(item.createdAt).toLocaleDateString('fa-IR') }),
        ]),
      ]);
      if (item.membershipStatus !== 'approved') {
        const approve = el('button', { class: 'btn secondary', type: 'button', text: 'تأیید عضویت' });
        approve.addEventListener('click', () => decide(item.id,'approved'));
        row.append(approve);
      } else {
        const resendApproval = el('button', { class: 'btn secondary', type: 'button', text: 'ارسال مجدد ایمیل پذیرش' });
        resendApproval.addEventListener('click', () => resendMembershipApproval(item.id, resendApproval));
        row.append(resendApproval);
      }
      if (item.membershipStatus !== 'rejected') {
        const reject = el('button', { class: 'btn danger', type: 'button', text: 'رد درخواست' });
        reject.addEventListener('click', () => { if (window.confirm('درخواست عضویت این کاربر رد شود؟')) decide(item.id,'rejected'); });
        row.append(reject);
      }
      targetList.append(row);
    }
  }
  let memberItems = [];
  async function refreshMembers() {
    membersNotice.className = 'form-status'; membersNotice.textContent = 'در حال دریافت فهرست اعضا…';
    const r = await getJson('/api/admin/members');
    if (!r.ok) { membersNotice.className = 'form-status err'; membersNotice.textContent = errorText(r.data,r.status); return; }
    memberItems = r.data.items || [];
    const activeMembers = memberItems.filter(x => x.membershipStatus !== 'rejected');
    const rejectedMembers = memberItems.filter(x => x.membershipStatus === 'rejected');
    const pending = activeMembers.filter(x => x.membershipStatus === 'pending').length;
    membersNotice.textContent = activeMembers.length + ' کاربر · ' + pending + ' درخواست در انتظار بررسی';
    renderMembers(activeMembers);
    renderMembers(rejectedMembers, rejectedMembersList, rejectedMembersSearch);
  }
  async function decide(userId, decision) {
    const r = await postJson('/api/admin/members/decision',{userId,decision});
    membersNotice.className = 'form-status' + (r.ok && (decision !== 'approved' || r.data?.emailSent) ? '' : ' err');
    membersNotice.textContent = !r.ok ? errorText(r.data,r.status)
      : decision === 'rejected' ? 'درخواست رد شد و نشست‌های فعال کاربر بسته شد.'
      : r.data?.alreadyApproved ? 'این عضویت قبلاً تأیید شده است؛ برای ارسال دوباره ایمیل از گزینهٔ مربوط به همان عضو استفاده کنید.'
      : r.data?.emailSent ? 'عضویت تأیید شد و ایمیل تبریک و خوش‌آمدگویی برای متقاضی ارسال شد.'
      : 'عضویت تأیید شد، اما ارسال ایمیل پذیرش ناموفق بود. می‌توانید از گزینهٔ «ارسال مجدد ایمیل پذیرش» استفاده کنید.';
    if (r.ok) await refreshMembers();
  }
  async function resendMembershipApproval(userId, button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'در حال ارسال…';
    const r = await postJson('/api/admin/members/approval-email',{userId});
    button.disabled = false;
    button.textContent = original;
    membersNotice.className = 'form-status' + (r.ok && r.data?.emailSent ? '' : ' err');
    membersNotice.textContent = r.ok && r.data?.emailSent ? 'ایمیل پذیرش و خوش‌آمدگویی با موفقیت ارسال شد.'
      : 'ارسال ایمیل پذیرش انجام نشد؛ تنظیمات سرویس ایمیل را بررسی و دوباره تلاش کنید.';
  }
  membersSearch.addEventListener('input', () => renderMembers(memberItems.filter(x => x.membershipStatus !== 'rejected')));
  rejectedMembersSearch.addEventListener('input', () => renderMembers(memberItems.filter(x => x.membershipStatus === 'rejected'), rejectedMembersList, rejectedMembersSearch));
  manualMemberForm.addEventListener('submit', async event => {
    event.preventDefault(); manualSubmit.disabled = true;
    const r = await postJson('/api/admin/members/manual',{
      displayName: manualName.querySelector('input').value.trim(), email: manualEmail.querySelector('input').value.trim(),
      professionalTitle: manualTitle.querySelector('input').value.trim(), position: manualPosition.querySelector('input').value.trim(),
      password: manualPassword.querySelector('input').value,
    });
    manualSubmit.disabled = false;
    membersNotice.className = 'form-status' + (r.ok ? '' : ' err');
    membersNotice.textContent = r.ok ? 'عضو با شماره ' + r.data.membershipNo + ' ثبت شد. ایمیل تأیید برای او ارسال شده است.' : errorText(r.data,r.status);
    if (r.ok) { manualMemberForm.reset(); await refreshMembers(); }
  });
  const membersView = el('section', { class: 'admin-view card', 'data-admin-view': 'members', hidden: 'hidden' }, [
    el('h2', { text: 'مدیریت اعضا و درخواست‌های عضویت' }),
    el('h3', { text: 'اعلان درخواست‌های جدید' }), el('p', { class: 'muted', text: 'با فعال‌سازی اعلان، هنگام ثبت‌نام متقاضی جدید روی این دستگاه پیام دریافت می‌کنید. برای دریافت اعلان روی آیفون، سایت باید به صفحهٔ اصلی افزوده شده باشد.' }), pushEnable, pushNotice,
    membersNotice, el('h3', { text: 'فهرست کاربران و درخواست‌ها' }), membersSearch, membersList,
    el('h3', { text: 'ثبت‌نام دستی عضو' }), el('p', { class: 'muted', text: 'رمز عبور موقت را امن به کاربر تحویل دهید؛ کاربر برای فعال‌سازی ورود باید ایمیل خود را نیز تأیید کند.' }), manualMemberForm,
  ]);
  const rejectedMembersView = el('section', { class: 'admin-view card', 'data-admin-view': 'rejected-members', hidden: 'hidden' }, [
    el('h2', { text: 'درخواست‌های ردشده' }), rejectedMembersSearch, rejectedMembersList,
  ]);
  await refreshMembers();

  const contentView = el('section', { class: 'admin-view card', 'data-admin-view': 'content', hidden: 'hidden' }, [
    el('h2', { text: 'مدیریت دوره‌ها و پرونده‌ها' }), notice, form,
    el('h3', { text: 'محتواهای ثبت‌شده' }), search, list,
  ]);
  const dashboardView = el('section', { class: 'admin-view admin-dashboard-view', 'data-admin-view': 'dashboard' });
  const importView = el('section', { class: 'admin-view', 'data-admin-view': 'imports', hidden: 'hidden' }, [importPanel]);
  const mediaView = el('section', { class: 'admin-view', 'data-admin-view': 'media', hidden: 'hidden' });
  const servicesView = el('section', { class: 'admin-view', 'data-admin-view': 'services', hidden: 'hidden' }, [mailPanel]);
  const classroomView = el('section', { class: 'admin-view', 'data-admin-view': 'classroom', hidden: 'hidden' });
  const trafficView = el('section', { class: 'admin-view', 'data-admin-view': 'traffic', hidden: 'hidden' });
  const accessNotice = el('p', { class: 'form-status', role: 'status' });
  const accessDescription = el('p', { class: 'muted', text: 'با غیرفعال‌کردن الزام ثبت‌نام، دستیار وکیل و ابزارهای عمومی هوش مصنوعی بدون ورود در دسترس قرار می‌گیرند. اطلاعات شخصی، مواعد، سوابق و پیشرفت آموزشی همچنان نیازمند ورود هستند.' });
  const registrationToggle = el('input', { type: 'checkbox', id: 'registration-required' });
  const registrationLabel = el('label', { class: 'admin-field' }, [el('span', { text: 'الزام ثبت‌نام برای استفاده از خدمات عمومی' }), registrationToggle]);
  const saveAccess = el('button', { class: 'btn', type: 'button', text: 'ذخیره تنظیم دسترسی' });
  const accessPanel = el('section', { class: 'card admin-import' }, [el('h2', { text: 'تنظیم دسترسی کاربران' }), accessDescription, registrationLabel, saveAccess, accessNotice]);
  servicesView.append(accessPanel);

  // انتخاب سرویس کلاس آنلاین؛ مقدار در app_settings ذخیره و فقط توسط مدیر قابل تغییر است.
  const classroomProviderNotice = el('p', { class: 'form-status', role: 'status' });
  const classroomProviderSelect = el('select', { 'aria-label': 'سرویس برگزاری کلاس آنلاین' }, [
    el('option', { value: 'jitsi', text: 'Jitsi (کلاس تعبیه‌شده داخل سایت)' }),
    el('option', { value: 'google_meet', text: 'Google Meet (ورود با پیوند خارجی)' }),
  ]);
  const classroomProviderLabel = el('label', { class: 'admin-field' }, [
    el('span', { text: 'سرویس پیش‌فرض برگزاری کلاس' }),
    classroomProviderSelect,
  ]);
  const classroomProviderDescription = el('p', { class: 'muted', text: 'Jitsi برای نمایش کلاس درون سایت در نظر گرفته شده است. Google Meet در این مرحله فقط با پیوند جداگانه قابل استفاده است و جلسه را داخل صفحه سایت نمایش نمی‌دهد. دسترسی هر دو سرویس از اینترنت ایران باید پیش از استفاده عملی آزمایش شود.' });
  const saveClassroomProvider = el('button', { class: 'btn', type: 'button', text: 'ذخیره سرویس کلاس آنلاین' });
  const classroomProviderPanel = el('section', { class: 'card admin-import' }, [
    el('h2', { text: 'تنظیم سرویس کلاس آنلاین' }),
    classroomProviderDescription,
    classroomProviderLabel,
    saveClassroomProvider,
    classroomProviderNotice,
  ]);
  async function loadClassroomProvider() {
    saveClassroomProvider.disabled = true;
    const result = await getJson('/api/admin/settings/classroom-provider');
    if (!result.ok) {
      classroomProviderNotice.className = 'form-status err';
      classroomProviderNotice.textContent = errorText(result.data, result.status);
      saveClassroomProvider.disabled = false;
      return;
    }
    classroomProviderSelect.value = result.data.provider === 'google_meet' ? 'google_meet' : 'jitsi';
    saveClassroomProvider.disabled = false;
    classroomProviderNotice.className = 'form-status';
    classroomProviderNotice.textContent = 'سرویس انتخاب‌شده: ' + (classroomProviderSelect.value === 'jitsi' ? 'Jitsi' : 'Google Meet');
  }
  saveClassroomProvider.addEventListener('click', async () => {
    saveClassroomProvider.disabled = true;
    classroomProviderNotice.className = 'form-status';
    classroomProviderNotice.textContent = 'در حال ذخیره تنظیم سرویس…';
    const result = await sendJson('PUT', '/api/admin/settings/classroom-provider', { provider: classroomProviderSelect.value });
    classroomProviderNotice.className = `form-status${result.ok ? ' ok' : ' err'}`;
    classroomProviderNotice.textContent = result.ok
      ? 'سرویس پیش‌فرض کلاس آنلاین ذخیره شد. این تنظیم برای کلاس‌های جدیدی که از این پس ایجاد می‌شوند اعمال خواهد شد.'
      : errorText(result.data, result.status);
    saveClassroomProvider.disabled = false;
  });
  classroomView.append(classroomProviderPanel);
  const classroomAdminNotice = el('p', { class: 'form-status', role: 'status' });
  const classroomAdminList = el('div', { class: 'admin-content-list' });
  const classroomTitleField = field('عنوان کلاس', 'classroomTitle');
  const classroomDescriptionField = field('توضیحات (اختیاری)', 'classroomDescription', '', 'textarea', false);
  const classroomStartField = field('تاریخ و ساعت شروع', 'classroomStartsAt', new Date(Date.now() + 3600000 - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16), 'datetime-local');
  const classroomDurationField = field('مدت کلاس به دقیقه (۱۵ تا ۲۴۰)', 'classroomDuration', '60', 'number');
  const classroomMeetUrlField = field('پیوند جلسه Google Meet', 'classroomMeetUrl', '', 'url', false);
  const classroomGuestToggle = el('input', { type: 'checkbox', name: 'guestEnabled' });
  const classroomGuestLabel = el('label', { class: 'admin-field' }, [el('span', { text: 'اجازه ورود مهمان با پیوند دعوت اختصاصی' }), classroomGuestToggle]);
  const classroomCreateButton = el('button', { class: 'btn', type: 'submit', text: 'ایجاد کلاس' });
  const classroomCreateForm = el('form', { class: 'admin-form card classroom-create-form' }, [
    el('h3', { text: 'برنامه‌ریزی کلاس جدید' }),
    el('p', { class: 'muted', text: 'کلاس برای اعضای تأییدشده قابل مشاهده است. در صورت فعال‌کردن مهمان، پیوند دعوت محرمانه فقط یک‌بار پس از ایجاد نمایش داده می‌شود.' }),
    classroomTitleField, classroomDescriptionField, classroomStartField, classroomDurationField,
    classroomMeetUrlField, classroomGuestLabel, classroomCreateButton,
  ]);
  function syncClassroomProviderFields() {
    classroomMeetUrlField.hidden = classroomProviderSelect.value !== 'google_meet';
    classroomMeetUrlField.querySelector('input').required = classroomProviderSelect.value === 'google_meet';
  }
  classroomProviderSelect.addEventListener('change', syncClassroomProviderFields);
  async function refreshClassroomAdmin() {
    const result = await getJson('/api/admin/classroom/sessions');
    if (!result.ok) {
      classroomAdminNotice.className = 'form-status err';
      classroomAdminNotice.textContent = errorText(result.data, result.status);
      classroomAdminList.replaceChildren();
      return;
    }
    classroomAdminNotice.className = 'form-status';
    classroomAdminNotice.textContent = result.data.sessions.length + ' کلاس ثبت شده است.';
    classroomAdminList.replaceChildren();
    if (!result.data.sessions.length) classroomAdminList.append(el('p', { class: 'muted', text: 'هنوز کلاسی ایجاد نشده است.' }));
    for (const item of result.data.sessions) {
      const row = el('article', { class: 'admin-content-row card classroom-admin-row' }, [
        el('div', {}, [
          el('span', { class: 'badge', text: item.status === 'cancelled' ? 'لغوشده' : (item.provider === 'jitsi' ? 'Jitsi' : 'Google Meet') }),
          el('h3', { text: item.title }),
          el('p', { class: 'muted', text: new Date(item.startsAt).toLocaleString('fa-IR') + ' · ' + item.durationMinutes + ' دقیقه' }),
          el('p', { class: 'muted', text: item.guestEnabled ? 'ورود مهمان فعال' : 'فقط اعضا' }),
        ]),
      ]);
      const actions = el('div', { class: 'row admin-actions' });
      const attendanceButton = el('button', { class: 'btn secondary', type: 'button', text: 'گزارش حضور و غیاب' });
      const attendancePanel = el('div', { class: 'classroom-attendance-list', hidden: 'hidden' });
      attendanceButton.addEventListener('click', async () => {
        attendancePanel.hidden = !attendancePanel.hidden;
        if (attendancePanel.hidden) return;
        attendancePanel.textContent = 'در حال دریافت گزارش…';
        const attendance = await getJson('/api/admin/classroom/sessions/' + item.id + '/attendance');
        if (!attendance.ok) { attendancePanel.textContent = errorText(attendance.data, attendance.status); return; }
        attendancePanel.replaceChildren(el('h4', { text: 'حاضران کلاس' }));
        if (!attendance.data.attendance.length) attendancePanel.append(el('p', { class: 'muted', text: 'هنوز حضوری ثبت نشده است.' }));
        for (const person of attendance.data.attendance) {
          attendancePanel.append(el('p', { text: person.display_name + ' · ' + person.attendee_type + ' · ' + Math.floor((person.duration_seconds || 0)/60) + ' دقیقه' }));
        }
      });
      actions.append(attendanceButton);
      if (item.status === 'scheduled') {
        const cancel = el('button', { class: 'btn danger', type: 'button', text: 'لغو کلاس' });
        cancel.addEventListener('click', async () => {
          if (!window.confirm('این کلاس لغو شود؟')) return;
          cancel.disabled = true;
          const saved = await sendJson('PATCH', '/api/admin/classroom/sessions/' + item.id, { status: 'cancelled' });
          classroomAdminNotice.className = 'form-status' + (saved.ok ? '' : ' err');
          classroomAdminNotice.textContent = saved.ok ? 'کلاس لغو شد.' : errorText(saved.data, saved.status);
          await refreshClassroomAdmin();
        });
        actions.append(cancel);
      }
      const classEnd = Date.parse(item.startsAt) + item.durationMinutes * 60000;
      const recordingExpiry = classEnd + 48 * 60 * 60 * 1000;
      if (item.recordingAvailable) {
        const recordingStatus = el('p', { class: 'form-status', text: 'فایل ضبط‌شده تا ' + new Date(recordingExpiry).toLocaleString('fa-IR') + ' در دسترس است.' });
        const deleteRecording = el('button', { class: 'btn danger', type: 'button', text: 'حذف فایل ضبط‌شده' });
        deleteRecording.addEventListener('click', async () => {
          if (!window.confirm('فایل ضبط‌شده برای همیشه حذف شود؟')) return;
          deleteRecording.disabled = true;
          const response = await fetch('/api/admin/classroom/sessions/' + item.id + '/recording', { method: 'DELETE', credentials: 'same-origin' });
          const data = await response.json().catch(() => ({}));
          recordingStatus.className = 'form-status' + (response.ok ? ' ok' : ' err');
          recordingStatus.textContent = response.ok ? 'فایل حذف شد.' : errorText(data, response.status);
          await refreshClassroomAdmin();
        });
        const recordingActions = el('div', { class: 'row admin-actions' }, [recordingStatus, deleteRecording]);
        row.append(recordingActions);
      } else if (Date.now() >= classEnd && Date.now() < recordingExpiry && item.status === 'scheduled') {
        const fileInput = el('input', { type: 'file', accept: 'video/mp4,video/webm', 'aria-label': 'فایل ضبط‌شده کلاس' });
        const uploadButton = el('button', { class: 'btn secondary', type: 'button', text: 'بارگذاری فایل ضبط‌شده' });
        const uploadStatus = el('p', { class: 'form-status', role: 'status', text: 'فقط فایل MP4 یا WebM تا سقف ۲ گیگابایت؛ فایل پس از پایان کلاس حداکثر ۴۸ ساعت نگهداری می‌شود.' });
        uploadButton.addEventListener('click', async () => {
          const file = fileInput.files?.[0];
          if (!file) { uploadStatus.className = 'form-status err'; uploadStatus.textContent = 'ابتدا فایل ویدئو را انتخاب کنید.'; return; }
          if (!['video/mp4','video/webm'].includes(file.type) || file.size > 2 * 1024 * 1024 * 1024) {
            uploadStatus.className = 'form-status err'; uploadStatus.textContent = 'فقط فایل MP4 یا WebM تا سقف ۲ گیگابایت پذیرفته می‌شود.'; return;
          }
          uploadButton.disabled = true; fileInput.disabled = true;
          try {
            uploadStatus.className = 'form-status'; uploadStatus.textContent = 'در حال آماده‌سازی بارگذاری…';
            const started = await postJson('/api/admin/classroom/sessions/' + item.id + '/recording', { fileName: file.name, contentType: file.type, sizeBytes: file.size });
            if (!started.ok) throw new Error(started.data?.message || errorText(started.data, started.status));
            const { recordingId, partBytes, partCount } = started.data;
            for (let part = 0; part < partCount; part++) {
              const chunk = file.slice(part * partBytes, Math.min(file.size, (part + 1) * partBytes));
              const response = await fetch('/api/admin/classroom/recordings/' + recordingId + '/parts/' + (part + 1), {
                method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk,
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data.message || errorText(data, response.status));
              uploadStatus.textContent = 'بارگذاری بخش ' + (part + 1) + ' از ' + partCount + '…';
            }
            const completed = await postJson('/api/admin/classroom/recordings/' + recordingId + '/complete', {});
            if (!completed.ok) throw new Error(completed.data?.message || errorText(completed.data, completed.status));
            uploadStatus.className = 'form-status ok'; uploadStatus.textContent = 'فایل با موفقیت بارگذاری شد و تا ۴۸ ساعت پس از پایان کلاس در دسترس خواهد بود.';
            await refreshClassroomAdmin();
          } catch (error) {
            uploadStatus.className = 'form-status err'; uploadStatus.textContent = error?.message || 'بارگذاری فایل انجام نشد.';
            uploadButton.disabled = false; fileInput.disabled = false;
          }
        });
        row.append(el('div', { class: 'card admin-import' }, [el('h4', { text: 'فایل ضبط‌شده کلاس' }), fileInput, uploadButton, uploadStatus]));
      }
      row.append(actions, attendancePanel);
      classroomAdminList.append(row);
    }
  }
  classroomCreateForm.addEventListener('submit', async event => {
    event.preventDefault();
    classroomCreateButton.disabled = true;
    classroomAdminNotice.className = 'form-status';
    classroomAdminNotice.textContent = 'در حال ایجاد کلاس…';
    const payload = {
      title: classroomTitleField.querySelector('input').value.trim(),
      description: classroomDescriptionField.querySelector('textarea').value.trim(),
      startsAt: new Date(classroomStartField.querySelector('input').value).toISOString(),
      durationMinutes: Number(classroomDurationField.querySelector('input').value),
      guestEnabled: classroomGuestToggle.checked,
      meetingUrl: classroomMeetUrlField.querySelector('input').value.trim(),
    };
    const created = await postJson('/api/admin/classroom/sessions', payload);
    classroomCreateButton.disabled = false;
    if (!created.ok) {
      classroomAdminNotice.className = 'form-status err';
      classroomAdminNotice.textContent = errorText(created.data, created.status);
      return;
    }
    classroomCreateForm.reset();
    classroomStartField.querySelector('input').value = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    classroomDurationField.querySelector('input').value = '60';
    syncClassroomProviderFields();
    classroomAdminNotice.className = 'form-status';
    classroomAdminNotice.textContent = 'کلاس ایجاد شد.';
    if (created.data.guestCode) {
      const invite = window.location.origin + '/#/classroom/guest?session=' + created.data.sessionId + '&code=' + encodeURIComponent(created.data.guestCode);
      classroomAdminNotice.append(el('span', { text: ' پیوند مهمان (این پیوند را فقط برای مدعوین ارسال کنید): ' }), el('a', { href: invite, text: 'مشاهده و کپی پیوند دعوت' }));
    }
    await refreshClassroomAdmin();
  });
  classroomView.append(classroomCreateForm, classroomAdminNotice, el('h3', { text: 'کلاس‌های ثبت‌شده' }), classroomAdminList);
  syncClassroomProviderFields();

  // مرکز سلامت و عیب‌یابی: گزارش‌های ناشناس مرورگر و API فقط برای مدیر مجاز.
  const diagnosticsNotice = el('p', { class: 'form-status diagnostics-live-status', role: 'status' });
  const diagnosticsList = el('div', { class: 'admin-content-list diagnostics-list' });
  const diagnosticsSummary = el('div', { class: 'diagnostics-summary', 'aria-live': 'polite' });
  const diagnosticsToolbar = el('div', { class: 'diagnostics-toolbar' });
  const diagnosticsFilter = el('select', { 'aria-label': 'فیلتر وضعیت گزارش‌ها' }, [
    el('option', { value: 'all', text: 'همهٔ گزارش‌ها' }),
    el('option', { value: 'open', text: 'نیازمند رسیدگی' }),
    el('option', { value: 'closed', text: 'بررسی‌شده' }),
  ]);
  const diagnosticsSearch = el('input', { type: 'search', placeholder: 'جست‌وجو در گزارش‌ها…', 'aria-label': 'جست‌وجو در گزارش‌های عیب‌یابی' });
  const diagnosticsRefresh = el('button', { class: 'btn secondary', type: 'button', text: 'تازه‌سازی گزارش‌ها' });
  const diagnosticsSelfTest = el('button', { class: 'btn', type: 'button', text: 'اجرای آزمون سلامت سیستم' });
  const diagnosticsWriteTest = el('button', { class: 'btn secondary', type: 'button', text: 'آزمون واقعی ساخت و پاک‌سازی PR در GitHub' });
  const manualReportToggle = el('button', { class: 'btn secondary', type: 'button', text: 'گزارش دستی مشکل' });
  const manualReportForm = el('form', { class: 'card admin-manual-diagnostic', hidden: 'hidden' });
  const manualReportComponent = el('select', { 'aria-label': 'بخش دارای مشکل' }, [
    ...[['site','کل سایت / مورد دیگر'],['auth','ورود و ثبت‌نام'],['academy','آموزش و آزمون'],['assistant','دستیار وکیل و هوش مصنوعی'],['calculator','محاسبه‌گر'],['regional-map','ارزش منطقه‌ای و نقشه'],['voice-typing','تایپ صوتی'],['calendar','تقویم و مواعد'],['cases','پرونده‌ها'],['media','رسانه و محتوا'],['unknown','نامشخص']].map(([value,label]) => el('option', { value, text: label }))
  ]);
  const manualReportDescription = el('textarea', { rows: 4, maxLength: 1200, required: 'required', placeholder: 'چه کاری انجام دادید و چه اتفاقی افتاد؟ اگر پیام خطایی دیدید، متن آن را بنویسید.' });
  const manualReportSubmit = el('button', { class: 'btn', type: 'submit', text: 'ثبت گزارش مشکل' });
  const manualReportCancel = el('button', { class: 'btn secondary', type: 'button', text: 'انصراف' });
  const manualReportHint = el('p', { class: 'muted', text: 'لطفاً اطلاعات هویتی، رمز، شماره تماس یا متن پرونده و اسناد محرمانه را وارد نکنید. مسیر صفحه به‌صورت خودکار ثبت می‌شود.' });
  manualReportForm.append(el('h3', { text: 'ثبت گزارش دستی' }), manualReportHint, manualReportComponent, manualReportDescription, manualReportSubmit, manualReportCancel);
  manualReportToggle.addEventListener('click', () => { manualReportForm.hidden = !manualReportForm.hidden; if (!manualReportForm.hidden) manualReportDescription.focus(); });
  manualReportCancel.addEventListener('click', () => { manualReportForm.hidden = true; manualReportDescription.value = ''; });
  manualReportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    manualReportSubmit.disabled = true;
    manualReportSubmit.textContent = 'در حال ثبت گزارش…';
    diagnosticsNotice.className = 'form-status';
    diagnosticsNotice.textContent = 'گزارش در حال ثبت است…';
    try {
      const result = await postJson('/api/admin/diagnostics/manual-report', {
        component: manualReportComponent.value,
        description: manualReportDescription.value,
        route: (window.location.hash || '#/').split('?')[0].replace(/^#/, '') || '/',
      }, { timeoutMs: 20000 });
      if (!result.ok) {
        diagnosticsNotice.className = 'form-status err';
        diagnosticsNotice.textContent = result.data?.hint || errorText(result.data, result.status);
        return;
      }
      manualReportDescription.value = '';
      manualReportForm.hidden = true;
      diagnosticsNotice.className = 'form-status ok';
      diagnosticsNotice.textContent = 'گزارش مشکل ثبت شد و در فهرست عیب‌یابی قرار گرفت.';
      await refreshDiagnostics();
    } catch {
      diagnosticsNotice.className = 'form-status err';
      diagnosticsNotice.textContent = 'ارتباط برقرار نشد؛ گزارش ثبت‌شده نیست. دوباره تلاش کنید.';
    } finally {
      manualReportSubmit.disabled = false;
      manualReportSubmit.textContent = 'ثبت گزارش مشکل';
    }
  });
  diagnosticsWriteTest.addEventListener('click', async () => {
    if (!window.confirm('این آزمون یک شاخه و Pull Request موقت در GitHub می‌سازد، سپس PR را می‌بندد و شاخه را حذف می‌کند. هیچ تغییری روی main اعمال نمی‌شود. ادامه می‌دهید؟')) return;
    diagnosticsWriteTest.disabled = true;
    diagnosticsWriteTest.textContent = 'در حال آزمون مجوز نوشتن GitHub…';
    diagnosticsNotice.className = 'form-status';
    diagnosticsNotice.textContent = 'در حال ساخت موقت شاخه و Pull Request و پاک‌سازی آن…';
    try {
      const result = await postJson('/api/admin/diagnostics/write-test', {});
      if (!result.ok) {
        diagnosticsNotice.className = 'form-status err';
        diagnosticsNotice.textContent = `${result.data?.message || errorText(result.data, result.status)} ${result.data?.githubMessage || ''} ${result.data?.pullRequestNumber ? `شماره PR: ${result.data.pullRequestNumber}.` : ''} وضعیت پاک‌سازی: ${result.data?.pullRequestClosed ? 'PR بسته شد' : 'PR بسته نشد'}؛ ${result.data?.branchDeleted ? 'شاخه حذف شد' : 'شاخه حذف نشد'}.`;
        return;
      }
      diagnosticsNotice.className = 'form-status ok';
      diagnosticsNotice.textContent = `${result.data.message} شماره PR آزمایشی: ${result.data.pullRequestNumber}.`;
    } catch {
      diagnosticsNotice.className = 'form-status err';
      diagnosticsNotice.textContent = 'ارتباط با آزمون نوشتن GitHub برقرار نشد؛ وضعیت نهایی باید از GitHub بررسی شود.';
    } finally {
      diagnosticsWriteTest.disabled = false;
      diagnosticsWriteTest.textContent = 'اجرای دوبارهٔ آزمون نوشتن GitHub';
    }
  });
  const diagnosticsTestResults = el('div', { class: 'admin-content-list', 'aria-live': 'polite' });
  diagnosticsSelfTest.addEventListener('click', async () => {
    diagnosticsSelfTest.disabled = true;
    diagnosticsSelfTest.textContent = 'در حال اجرای آزمون‌ها…';
    diagnosticsTestResults.replaceChildren();
    diagnosticsNotice.className = 'form-status';
    diagnosticsNotice.textContent = 'در حال بررسی اعتبارسنجی، D1، Gemini و دسترسی خواندن GitHub…';
    try {
      const result = await postJson('/api/admin/diagnostics/self-test', {}, { timeoutMs: 60000 });
      if (!result.ok) {
        diagnosticsNotice.className = 'form-status err';
        diagnosticsNotice.textContent = errorText(result.data, result.status);
        return;
      }
      for (const check of result.data.checks || []) {
        diagnosticsTestResults.append(el('article', { class: 'admin-content-row card' }, [
          el('div', {}, [
            el('span', { class: `badge${check.ok ? ' success' : ' danger'}`, text: check.ok ? 'موفق' : 'ناموفق' }),
            el('h3', { text: check.label }),
            el('p', { class: 'muted', text: check.detail }),
          ]),
        ]));
      }
      diagnosticsNotice.className = `form-status${result.data.ok ? ' ok' : ' err'}`;
      diagnosticsNotice.textContent = `نتیجهٔ آزمون: ${result.data.passed} از ${result.data.total} مرحله موفق بود. ${result.data.note}`;
    } catch {
      diagnosticsNotice.className = 'form-status err';
      diagnosticsNotice.textContent = result.timeoutError ? 'پاسخ آزمون در مهلت ۶۰ ثانیه‌ای نرسید؛ ممکن است بررسی سرور هنوز کامل نشده باشد. گزارش رخدادهای Worker را بررسی کنید.' : 'ارتباط با سرویس آزمون برقرار نشد؛ اتصال شبکه یا پاسخ Worker را بررسی کنید.';
    } finally {
      diagnosticsSelfTest.disabled = false;
      diagnosticsSelfTest.textContent = 'اجرای دوبارهٔ آزمون سلامت';
    }
  });
  let diagnosticItems = [];
  function renderDiagnosticSummary(items = []) {
    const open = items.filter((item) => item.status === 'open');
    const repeated = items.filter((item) => Number(item.occurrences) > 1);
    const latest = items[0]?.lastSeen ? new Date(items[0].lastSeen).toLocaleString('fa-IR') : '—';
    diagnosticsSummary.replaceChildren(
      ...[
        ['گزارش‌های ثبت‌شده', items.length, 'در بازهٔ گزارش‌های اخیر'],
        ['نیازمند رسیدگی', open.length, 'مواردی که هنوز بسته نشده‌اند'],
        ['رخدادهای تکرارشونده', repeated.length, 'دارای بیش از یک تکرار'],
        ['آخرین گزارش', latest, 'زمان تازه‌ترین رخداد'],
      ].map(([label, value, hint]) => el('article', { class: 'diagnostics-stat' }, [
        el('span', { class: 'diagnostics-stat-label', text: label }),
        el('strong', { class: 'diagnostics-stat-value', text: String(value) }),
        el('small', { text: hint }),
      ])),
    );
  }
  function renderDiagnosticList() {
    const query = diagnosticsSearch.value.trim().toLocaleLowerCase();
    const state = diagnosticsFilter.value;
    const filtered = diagnosticItems.filter((item) => {
      if (state !== 'all' && item.status !== state) return false;
      const haystack = [item.errorCode, item.component, item.route, item.category, item.detail].join(' ').toLocaleLowerCase();
      return !query || haystack.includes(query);
    });
    diagnosticsList.replaceChildren();
    if (!filtered.length) {
      diagnosticsList.append(el('div', { class: 'diagnostics-empty' }, [
        el('strong', { text: diagnosticItems.length ? 'گزارشی با این مشخصات پیدا نشد.' : 'هنوز گزارشی ثبت نشده است.' }),
        el('p', { class: 'muted', text: diagnosticItems.length ? 'فیلتر یا عبارت جست‌وجو را تغییر دهید.' : 'در صورت مشاهدهٔ مشکل، گزارش دستی ثبت کنید یا کمی بعد دوباره بررسی کنید.' }),
      ]));
      return;
    }
    for (const item of filtered) appendDiagnosticCard(item);
  }
  diagnosticsFilter.addEventListener('change', renderDiagnosticList);
  diagnosticsSearch.addEventListener('input', renderDiagnosticList);

  let repairConfigured = false;
  let repairHint = 'وضعیت عامل هوشمند هنوز بررسی نشده است.';
  function appendDiagnosticCard(item) {
    const row = el('article', { class: `admin-content-row card admin-diagnostic-card ${item.status === 'open' ? 'is-open' : 'is-closed'}` });
    const heading = el('div');
    heading.append(
      el('span', { class: `diagnostics-state ${item.status === 'open' ? 'is-open' : 'is-closed'}`, text: item.status === 'open' ? 'نیازمند رسیدگی' : 'بررسی‌شده' }),
      el('h3', { class: 'diagnostics-card-title', text: `${item.errorCode} · ${item.component}` }),
      el('p', { class: 'muted', text: `مسیر: ${item.route} · نوع: ${item.category} · HTTP: ${item.httpStatus || '—'}` }),
      el('p', { class: 'muted', text: `تکرار: ${item.occurrences} · آخرین رخداد: ${new Date(item.lastSeen).toLocaleString('fa-IR')}` }),
    );
    if (item.detail) {
      const report = el('section', { class: 'admin-diagnostic-detail' }, [
        el('h4', { text: item.category === 'manual' ? 'شرح گزارش' : 'جزئیات رخداد' }),
        el('p', { text: item.detail }),
      ]);
      heading.append(report);
    }
    const analysisPanel = el('section', { class: 'admin-diagnostic-analysis', 'aria-live': 'polite' }, [
      el('h4', { text: 'تحلیل هوشمند' }),
      el('p', { class: 'muted', text: repairHint }),
    ]);
    row.append(heading, analysisPanel);
    if (item.status === 'open') {
      const repair = el('button', { class: 'btn', type: 'button', text: 'تحلیل دوباره' });
      repair.disabled = !repairConfigured;
      repair.addEventListener('click', async () => {
        if (!window.confirm('هوش مصنوعی گزارش و کد مرتبط را بررسی می‌کند و فقط در صورت یافتن اصلاح امن، یک Pull Request برای بازبینی می‌سازد. هیچ تغییری مستقیماً منتشر نمی‌شود. ادامه می‌دهید؟')) return;
        repair.disabled = true;
        repair.textContent = 'در حال تحلیل کد و ساخت اصلاحیه…';
        analysisPanel.replaceChildren(
          el('h4', { text: 'تحلیل هوشمند' }),
          el('p', { class: 'muted', text: 'در حال بررسی گزارش و فایل کد مرتبط…' }),
        );
        let proposed;
        try {
          proposed = await postJson('/api/admin/diagnostics/repair', { fingerprint: item.fingerprint }, { timeoutMs: 120000 });
        } catch {
          proposed = { ok: false, status: 0, networkError: true };
        }
        if (!proposed.ok) {
          const message = proposed.timeoutError
            ? 'زمان تحلیل بیش از مهلت مجاز شد؛ نتیجه‌ای از ساخت PR دریافت نشد. دوباره تلاش کنید.'
            : proposed.networkError || proposed.status === 0
              ? 'ارتباط با سرویس تحلیل برقرار نشد؛ وضعیت Worker و GitHub را بررسی کنید.'
              : proposed.data?.hint || proposed.data?.error
                ? `${proposed.data.hint || proposed.data.error}${proposed.data.reason ? ` · علت: ${proposed.data.reason}` : ''}${proposed.data.stage ? ` · مرحله: ${proposed.data.stage}` : ''} (HTTP ${proposed.status})`
                : errorText(proposed.data, proposed.status);
          analysisPanel.replaceChildren(el('h4', { text: 'تحلیل ناموفق بود' }), el('p', { class: 'form-status err', text: message }));
          repair.disabled = false;
          repair.textContent = 'تلاش دوباره برای تحلیل';
          return;
        }
        const summary = proposed.data.summary || proposed.data.hint || 'اصلاح امنی پیشنهاد نشد؛ هیچ PR ساخته نشد.';
        analysisPanel.replaceChildren(
          el('h4', { text: proposed.data.created ? 'نتیجهٔ تحلیل؛ PR اصلاحی ساخته شد' : 'نتیجهٔ تحلیل' }),
          el('p', { text: summary }),
          ...(proposed.data.file ? [el('p', { class: 'muted', text: `فایل بررسی‌شده: ${proposed.data.file}` })] : []),
          ...(proposed.data.confidence ? [el('p', { class: 'muted', text: `میزان اطمینان مدل: ${proposed.data.confidence}` })] : []),
          ...(Array.isArray(proposed.data.tests) && proposed.data.tests.length ? [
            el('h5', { text: 'آزمون‌های پیشنهادی (هنوز اجرا نشده‌اند)' }),
            el('ul', {}, proposed.data.tests.map((test) => el('li', { text: test }))),
          ] : []),
          ...(proposed.data.created && proposed.data.pullRequest ? [
            el('a', { href: proposed.data.pullRequest, target: '_blank', rel: 'noopener noreferrer', class: 'btn secondary' }, [document.createTextNode(`مشاهده PR شمارهٔ ${proposed.data.number}`)]),
          ] : []),
        );
        repair.disabled = false;
        repair.textContent = proposed.data.created ? 'تحلیل انجام شد' : 'تحلیل دوباره';
      });
      row.append(repair);
      const resolve = el('button', { class: 'btn secondary', type: 'button', text: 'علامت‌گذاری به‌عنوان بررسی‌شده' });
      resolve.addEventListener('click', async () => {
        resolve.disabled = true;
        const saved = await postJson('/api/admin/diagnostics/resolve', { fingerprint: item.fingerprint });
        if (!saved.ok) {
          resolve.disabled = false;
          analysisPanel.replaceChildren(el('h4', { text: 'خطا در ثبت وضعیت' }), el('p', { class: 'form-status err', text: errorText(saved.data, saved.status) }));
          return;
        }
        await refreshDiagnostics();
      });
      row.append(resolve);
    }
    diagnosticsList.append(row);
  }
  async function refreshDiagnostics() {
    diagnosticsRefresh.disabled = true;
    diagnosticsNotice.className = 'form-status';
    diagnosticsNotice.textContent = 'در حال دریافت گزارش‌ها…';
    const result = await getJson('/api/admin/diagnostics');
    diagnosticsRefresh.disabled = false;
    if (!result.ok) {
      diagnosticsNotice.className = 'form-status err';
      diagnosticsNotice.textContent = errorText(result.data, result.status);
      diagnosticsList.replaceChildren();
      return;
    }
    diagnosticItems = Array.isArray(result.data.items) ? result.data.items : [];
    renderDiagnosticSummary(diagnosticItems);
    diagnosticsNotice.className = 'form-status diagnostics-live-status';
    diagnosticsNotice.textContent = `${result.data.openCount} گزارش نیازمند رسیدگی از ${diagnosticItems.length} گزارش اخیر.`;
    const repairStatus = await getJson('/api/admin/diagnostics/repair/status');
    repairConfigured = repairStatus.ok && repairStatus.data.configured;
    repairHint = repairConfigured
      ? 'عامل هوشمند آمادهٔ ساخت PR پیشنهادی است؛ هیچ تغییری خودکار روی main منتشر نمی‌شود.'
      : 'برای ساخت PR خودکار، Secret با نام GH_REPAIR_TOKEN در Cloudflare Worker لازم است؛ کلید Gemini نیز باید فعال باشد.';
    renderDiagnosticList();
  }
  const diagnosticsPanel = el('section', { class: 'diagnostics-page' }, [
    el('header', { class: 'diagnostics-page-header' }, [
      el('div', {}, [
        el('span', { class: 'section-kicker', text: 'پایش و نگهداری سامانه' }),
        el('h2', { text: 'سلامت و عیب‌یابی سایت' }),
        el('p', { class: 'muted', text: 'وضعیت خطاها، سرویس‌های اصلی و گزارش‌های کاربران را در یک نمای روشن و یکپارچه دنبال کنید.' }),
      ]),
      el('span', { class: 'diagnostics-page-mark', text: '● پایش سامانه' }),
    ]),
    diagnosticsSummary,
    el('section', { class: 'diagnostics-actions-panel' }, [
      el('div', { class: 'diagnostics-section-heading' }, [
        el('div', {}, [el('h3', { text: 'ابزارهای بررسی' }), el('p', { class: 'muted', text: 'آزمون‌ها را هنگام نیاز اجرا کنید؛ هیچ تغییری خودکار روی سایت منتشر نمی‌شود.' })]),
      ]),
      el('div', { class: 'diagnostics-action-groups' }, [
        el('div', { class: 'diagnostics-action-group' }, [
          el('strong', { text: 'گزارش و پایش' }),
          diagnosticsRefresh, manualReportToggle,
        ]),
        el('div', { class: 'diagnostics-action-group' }, [
          el('strong', { text: 'آزمون سرویس‌ها' }),
          diagnosticsSelfTest, diagnosticsWriteTest,
        ]),
      ]),
      manualReportForm,
      diagnosticsNotice,
      diagnosticsTestResults,
    ]),
    el('section', { class: 'diagnostics-reports-section' }, [
      el('div', { class: 'diagnostics-section-heading' }, [
        el('div', {}, [el('h3', { text: 'گزارش‌های ثبت‌شده' }), el('p', { class: 'muted', text: 'برای دیدن جزئیات، تحلیل هوشمند یا بستن هر گزارش، همان کارت را بازبینی کنید.' })]),
        el('span', { class: 'diagnostics-count-label', text: 'حداکثر ۱۵۰ گزارش اخیر' }),
      ]),
      el('div', { class: 'diagnostics-filters' }, [diagnosticsSearch, diagnosticsFilter]),
      diagnosticsList,
    ]),
  ]);
  servicesView.append(diagnosticsPanel);
  diagnosticsRefresh.addEventListener('click', refreshDiagnostics);
  const loadAccess = async () => {
    const result = await getJson('/api/admin/settings/access');
    if (!result.ok) { accessNotice.className = 'form-status err'; accessNotice.textContent = errorText(result.data, result.status); saveAccess.disabled = true; return; }
    registrationToggle.checked = result.data.registrationRequired;
    saveAccess.disabled = false;
  };
  saveAccess.addEventListener('click', async () => {
    saveAccess.disabled = true;
    const result = await sendJson('PUT', '/api/admin/settings/access', { registrationRequired: registrationToggle.checked });
    accessNotice.className = `form-status${result.ok ? ' ok' : ' err'}`;
    accessNotice.textContent = result.ok ? (result.data.registrationRequired ? 'الزام ثبت‌نام فعال شد.' : 'دسترسی مهمان فعال شد.') : errorText(result.data, result.status);
    saveAccess.disabled = false;
  });
  loadAccess();

  function showKindFields() {
    const isCourse = select.value === 'course';
    lessonsField.hidden = !isCourse;
    areaField.hidden = isCourse;
    factsField.hidden = isCourse;
    issuesField.hidden = isCourse;
    evidenceField.hidden = isCourse;
    caseJsonField.hidden = isCourse;
    levelField.hidden = !isCourse;
    caseJsonField.querySelector('textarea').required = !isCourse;
    lessonsField.querySelector('textarea').required = isCourse;
    areaField.querySelector('input').required = !isCourse;
    factsField.querySelector('textarea').required = !isCourse;
    issuesField.querySelector('textarea').required = !isCourse;
    evidenceField.querySelector('textarea').required = !isCourse;
  }
  function resetForm() {
    editingId = null;
    select.disabled = false;
    form.reset(); statusSelect.value = 'draft'; levelField.querySelector('input').value = 'مقدماتی'; areaField.querySelector('input').value = 'قراردادها';
    lessonsField.querySelector('textarea').value = ''; factsField.querySelector('textarea').value = ''; issuesField.querySelector('textarea').value = ''; evidenceField.querySelector('textarea').value = ''; caseJsonField.querySelector('textarea').value = '';
    submit.textContent = 'ذخیرهٔ محتوا'; cancel.hidden = true; showKindFields();
  }
  function payloadFromForm() {
    if (select.value === 'course') {
      const lessons = parseLines(lessonsField.querySelector('textarea').value).map((line) => {
        const [id, title, ...body] = line.split('|'); return { id: (id || '').trim(), title: (title || '').trim(), body: body.join('|').trim() };
      });
      return { level: levelField.querySelector('input').value.trim(), lessons };
    }
    const issues = parseLines(issuesField.querySelector('textarea').value).map((line) => {
      const [id, ...text] = line.split('|'); return { id: (id || '').trim(), text: text.join('|').trim() };
    });
    // پروندهٔ بانک: JSON کامل؛ خطای قالب همین‌جا گزارش می‌شود و به سرور ارسال نمی‌شود.
    const raw = caseJsonField.querySelector('textarea').value;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('JSON پرونده معتبر نیست؛ ساختار را بررسی کنید.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON پرونده باید یک شیء باشد.');
    return parsed;
  }
  async function refresh() {
    const result = await getJson('/api/admin/content');
    if (!result.ok) { notice.className = 'form-status err'; notice.textContent = errorText(result.data, result.status); form.hidden = true; list.replaceChildren(); return; }
    form.hidden = false; notice.textContent = `${result.data.items.length} محتوا دریافت شد.`; notice.className = 'form-status'; currentItems = result.data.items; list.replaceChildren();
    if (!currentItems.length) list.append(el('p', { class: 'muted', text: 'هنوز محتوایی ثبت نشده است.' }));
    updateDashboard();
    for (const item of currentItems) {
      const statusText = item.status === 'published' ? 'منتشرشده' : (item.payload?.review_status || 'پیش‌نویس');
      const row = el('article', { class: 'admin-content-row card' }, [
        el('div', {}, [el('span', { class: 'badge', text: `${item.kind === 'course' ? 'دوره' : 'پرونده'} · ${statusText}` }), el('h3', { text: item.title }), el('p', { class: 'muted', text: `${item.slug} — ${item.summary}` })]),
      ]);
      const actions = el('div', { class: 'row admin-actions' });
      const edit = el('button', { class: 'btn secondary', type: 'button', text: 'ویرایش' });
      edit.addEventListener('click', () => {
        editingId = item.id; select.value = item.kind; select.disabled = true; slugField.querySelector('input').value = item.slug; titleField.querySelector('input').value = item.title; summaryField.querySelector('textarea').value = item.summary; statusSelect.value = item.status;
        levelField.querySelector('input').value = item.payload.level || 'مقدماتی';
        if (item.kind === 'course') lessonsField.querySelector('textarea').value = lineList((item.payload.lessons || []).map((x) => `${x.id}|${x.title}|${x.body}`));
        else { caseJsonField.querySelector('textarea').value = JSON.stringify(item.payload?.id ? item.payload : { ...item.payload, id: item.slug }, null, 2); }
        submit.textContent = 'ثبت تغییرات'; cancel.hidden = false; showKindFields(); form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const toggle = el('button', { class: 'btn secondary', type: 'button', text: item.status === 'published' ? 'خروج از انتشار' : 'انتشار' });
      toggle.addEventListener('click', async () => {
        const result = await sendJson('PATCH', `/api/admin/content/${item.id}`, { status: item.status === 'published' ? 'draft' : 'published' });
        notice.className = `form-status${result.ok ? '' : ' err'}`; notice.textContent = result.ok ? 'وضعیت انتشار تغییر کرد.' : errorText(result.data, result.status); if (result.ok) await refresh();
      });
      actions.append(edit, toggle);
      if (item.status === 'draft') {
        const remove = el('button', { class: 'btn danger', type: 'button', text: 'حذف پیش‌نویس' });
        remove.addEventListener('click', async () => {
          if (!window.confirm('این پیش‌نویس حذف شود؟')) return;
          const result = await sendJson('DELETE', `/api/admin/content/${item.id}`);
          notice.className = `form-status${result.ok ? '' : ' err'}`; notice.textContent = result.ok ? 'پیش‌نویس حذف شد.' : errorText(result.data, result.status); if (result.ok) await refresh();
        });
        actions.append(remove);
      }
      row.dataset.search = `${item.title} ${item.slug} ${statusText}`;
      row.append(actions); list.append(row);
    }
  }
  select.addEventListener('change', showKindFields);
  cancel.addEventListener('click', resetForm);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let body;
    try {
      body = { kind: select.value, slug: slugField.querySelector('input').value.trim(), title: titleField.querySelector('input').value.trim(), summary: summaryField.querySelector('textarea').value.trim(), status: statusSelect.value, payload: payloadFromForm() };
    } catch (error) {
      notice.className = 'form-status err'; notice.textContent = error.message; return;
    }
    const result = editingId ? await sendJson('PATCH', `/api/admin/content/${editingId}`, body) : await postJson('/api/admin/content', body);
    notice.className = `form-status${result.ok ? '' : ' err'}`;
    notice.textContent = result.ok ? (editingId ? 'محتوا به‌روزرسانی شد.' : 'محتوا ثبت شد.') : errorText(result.data, result.status);
    if (result.ok) { resetForm(); await refresh(); }
  });
  // بانک قوانین: ورود گروهی متن و بازبینی وضعیت هر سند.
  const legalBankNotice = el('p', { class: 'form-status', role: 'status' });
  const legalBankJson = field('اطلاعات قانون و مواد به قالب JSON (متن کامل هر ماده)', 'legalBankJson', '', 'textarea');
  legalBankJson.querySelector('textarea').rows = 20;
  legalBankJson.querySelector('textarea').spellcheck = false;
  const legalBankFile = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'انتخاب فایل JSON قانون' });
  const legalBankFileField = el('label', { class: 'admin-field' }, [
    el('span', { text: 'یا فایل JSON قانون را انتخاب کن' }),
    legalBankFile,
    el('small', { class: 'muted', text: 'حداکثر ۴ مگابایت؛ فایل فقط در مرورگر خوانده می‌شود و پس از بارگذاری، محتوایش برای بررسی در کادر بالا قرار می‌گیرد.' }),
  ]);
  legalBankFile.addEventListener('change', async () => {
    const file = legalBankFile.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      legalBankNotice.className = 'form-status err';
      legalBankNotice.textContent = 'حجم فایل بیش از ۴ مگابایت است.';
      legalBankFile.value = '';
      return;
    }
    try {
      const raw = await file.text();
      JSON.parse(raw);
      legalBankJson.querySelector('textarea').value = raw;
      legalBankNotice.className = 'form-status';
      legalBankNotice.textContent = 'فایل خوانده شد؛ اطلاعات را بررسی کن و سپس ثبت قانون را بزن.';
    } catch {
      legalBankNotice.className = 'form-status err';
      legalBankNotice.textContent = 'فایل انتخاب‌شده JSON معتبر نیست.';
    }
  });
  const legalBankSubmit = el('button', { class: 'btn', type: 'submit', text: 'ثبت قانون در وضعیت نیازمند بررسی' });
  const legalBankForm = el('form', { class: 'admin-form card' }, [
    el('p', { class: 'muted', text: 'هر سند ابتدا در وضعیت «نیازمند بررسی» ثبت می‌شود و تا تأیید مدیر در پاسخ دستیار استفاده نخواهد شد. متن را از منبع رسمی و همراه با اصلاحات وارد کنید.' }),
    legalBankFileField, legalBankJson, legalBankSubmit,
  ]);
  const legalBankList = el('div', { class: 'admin-content-list' });
  async function refreshLegalBank() {
    const r = await getJson('/api/admin/legal-bank/list');
    if (!r.ok) { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = errorText(r.data, r.status); legalBankList.replaceChildren(); return; }
    legalBankNotice.className = 'form-status'; legalBankNotice.textContent = `${r.data.items.length} سند در بانک ثبت شده است.`;
    legalBankList.replaceChildren();
    if (!r.data.items.length) legalBankList.append(el('p', { class: 'muted', text: 'هنوز قانونی ثبت نشده است.' }));
    for (const item of r.data.items) {
      const statusLabels = { needs_review: 'نیازمند بررسی', verified: 'تأییدشده', amended: 'اصلاح‌شده', repealed: 'منسوخ' };
      const row = el('article', { class: 'admin-content-row card' }, [
        el('div', {}, [
          el('span', { class: 'badge', text: statusLabels[item.status] || item.status }),
          el('h3', { text: item.title }),
          el('p', { class: 'muted', text: `${item.articleCount} ماده · ${item.verifiedArticles || 0} ماده تأییدشده · ${item.slug}` }),
          el('p', { class: 'muted', text: item.sourceName || 'منبع ثبت نشده' }),
        ]),
      ]);
      const status = el('select', { 'aria-label': `وضعیت ${item.title}` }, [
        el('option', { value: 'needs_review', text: 'نیازمند بررسی' }),
        el('option', { value: 'verified', text: 'تأییدشده' }),
        el('option', { value: 'amended', text: 'اصلاح‌شده' }),
        el('option', { value: 'repealed', text: 'منسوخ' }),
      ]);
      status.value = item.status;
      status.addEventListener('change', async () => {
        const r = await sendJson('PATCH', '/api/admin/legal-bank/status', { lawId: item.id, status: status.value });
        legalBankNotice.className = `form-status${r.ok ? '' : ' err'}`;
        legalBankNotice.textContent = r.ok ? 'وضعیت سند تغییر کرد؛ وضعیت مواد بدون تغییر باقی ماند.' : errorText(r.data, r.status);
        if (r.ok) await refreshLegalBank();
      });
      const manage = el('button', { class: 'btn secondary', type: 'button', text: 'مدیریت مواد' });
      const articlePanel = el('div', { class: 'admin-content-list', hidden: 'hidden' });
      manage.addEventListener('click', async () => {
        if (!articlePanel.hidden) { articlePanel.hidden = true; manage.textContent = 'مدیریت مواد'; return; }
        manage.disabled = true;
        const result = await getJson(`/api/admin/legal-bank/articles?lawId=${item.id}`);
        manage.disabled = false;
        if (!result.ok) { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = errorText(result.data, result.status); return; }
        articlePanel.replaceChildren();
        const relationLabels = { amends: 'اصلاح می‌کند', repeals: 'نسخ می‌کند', replaces: 'جایگزین می‌کند', interprets: 'تفسیر می‌کند' };
        for (const article of result.data.items) {
          const articleRelations = (result.data.relations || []).filter((r) => r.authorityArticleId === article.id || r.affectedArticleId === article.id);
          const relationSummary = articleRelations.map((r) => `ماده ${r.authorityArticleNumber} ${relationLabels[r.relationType]} ماده ${r.affectedArticleNumber}${r.effectiveDate ? ' از ' + r.effectiveDate : ''}${r.sourceNote ? ' — ' + r.sourceNote : ''}`);

          const heading = el('h4', { text: `ماده ${article.number} · شناسه ${article.id}${article.heading ? ' ـ ' + article.heading : ''}` });
          const statusSelect = el('select', { 'aria-label': `وضعیت ماده ${article.number}` }, [
            el('option', { value: 'needs_review', text: 'نیازمند بررسی' }),
            el('option', { value: 'verified', text: 'تأییدشده' }),
            el('option', { value: 'amended', text: 'اصلاح‌شده' }),
            el('option', { value: 'repealed', text: 'منسوخ' }),
          ]);
          statusSelect.value = article.status;
          const note = el('textarea', { rows: '2', placeholder: 'توضیح وضعیت یا مستند اصلاح/نسخ' });
          note.value = article.statusNote || '';
          const sourceName = el('input', { type: 'text', placeholder: 'نام منبع اصلاح یا نسخ' });
          sourceName.value = article.statusSourceName || '';
          const sourceUrl = el('input', { type: 'url', placeholder: 'نشانی منبع (HTTPS)' });
          sourceUrl.value = article.statusSourceUrl || '';
          const effectiveDate = el('input', { type: 'text', placeholder: 'تاریخ اثر YYYY-MM-DD' });
          effectiveDate.value = article.statusEffectiveDate || '';
          const save = el('button', { class: 'btn', type: 'button', text: 'ذخیره وضعیت ماده' });
          save.addEventListener('click', async () => {
            save.disabled = true;
            const saved = await sendJson('PATCH', '/api/admin/legal-bank/article-status', {
              articleId: article.id, status: statusSelect.value, statusNote: note.value,
              statusSourceName: sourceName.value, statusSourceUrl: sourceUrl.value, statusEffectiveDate: effectiveDate.value,
            });
            save.disabled = false;
            legalBankNotice.className = `form-status${saved.ok ? '' : ' err'}`;
            legalBankNotice.textContent = saved.ok ? `وضعیت ماده ${article.number} ذخیره شد.` : errorText(saved.data, saved.status);
          });
          const relationTitle = el('p', { class: 'muted', text: 'ثبت رابطه با ماده‌ای دیگر (شناسه داخلی ماده را وارد کنید)' });
          const targetId = el('input', { type: 'number', min: '1', placeholder: 'شناسه داخلی ماده مرتبط' });
          const relationType = el('select', { 'aria-label': 'نوع رابطه' }, [
            el('option', { value: 'amends', text: 'اصلاح می‌کند' }),
            el('option', { value: 'repeals', text: 'نسخ می‌کند' }),
            el('option', { value: 'replaces', text: 'جایگزین می‌کند' }),
            el('option', { value: 'interprets', text: 'تفسیر می‌کند' }),
          ]);
          const relationNote = el('input', { type: 'text', placeholder: 'مستند و توضیح رابطه' });
          const relationDate = el('input', { type: 'text', placeholder: 'تاریخ اثر YYYY-MM-DD (اختیاری)' });
          const relationSave = el('button', { class: 'btn secondary', type: 'button', text: 'ثبت رابطه' });
          relationSave.addEventListener('click', async () => {
            const relatedId = Number(targetId.value);
            if (!Number.isInteger(relatedId) || relatedId < 1) { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = 'شناسه داخلی ماده مرتبط را وارد کنید.'; return; }
            relationSave.disabled = true;
            const saved = await postJson('/api/admin/legal-bank/relations', {
              affectedArticleId: relatedId, authorityArticleId: article.id,
              relationType: relationType.value, sourceNote: relationNote.value, effectiveDate: relationDate.value,
            });
            relationSave.disabled = false;
            legalBankNotice.className = `form-status${saved.ok ? '' : ' err'}`;
            legalBankNotice.textContent = saved.ok ? 'رابطه حقوقی ثبت شد.' : errorText(saved.data, saved.status);
          });
          articlePanel.append(el('article', { class: 'admin-content-row card' }, [
            heading, el('p', { class: 'muted', text: article.bodyPreview || '' }),
            ...(relationSummary.length ? [el('p', { class: 'muted', text: relationSummary.join(' | ') })] : []),
            statusSelect, note, sourceName, sourceUrl, effectiveDate, save, relationTitle, targetId, relationType, relationNote, relationDate, relationSave,
          ]));
        }
        articlePanel.hidden = false;
        manage.textContent = 'بستن مواد';
      });
      row.append(el('div', { class: 'row admin-actions' }, [status, manage]));
      row.append(articlePanel);
      legalBankList.append(row);
    }
  }
  legalBankForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    let payload;
    try { payload = JSON.parse(legalBankJson.querySelector('textarea').value); }
    catch { legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = 'ساختار JSON معتبر نیست.'; return; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      legalBankNotice.className = 'form-status err'; legalBankNotice.textContent = 'اطلاعات قانون باید یک شیء JSON باشد.'; return;
    }
    legalBankSubmit.disabled = true;
    const r = await postJson('/api/admin/legal-bank/import', payload);
    legalBankSubmit.disabled = false;
    legalBankNotice.className = `form-status${r.ok ? '' : ' err'}`;
    legalBankNotice.textContent = r.ok ? `قانون با ${r.data.articles} ماده در وضعیت نیازمند بررسی ثبت شد.` : errorText(r.data, r.status);
    if (r.ok) { legalBankJson.querySelector('textarea').value = ''; await refreshLegalBank(); }
  });
  const legalBankView = el('section', { class: 'admin-view card', 'data-admin-view': 'legal-bank', hidden: 'hidden' }, [
    el('h2', { text: 'بانک قوانین و مقررات' }),
    el('p', { class: 'muted', text: 'ورود متن کامل قوانین، ثبت منبع و مدیریت وضعیت اعتبار. فقط قوانین و موادی که تأیید شده‌اند در پاسخ‌های دستیار بازیابی می‌شوند.' }),
    legalBankNotice, legalBankForm,
    el('h3', { text: 'اسناد ثبت‌شده' }), legalBankList,
  ]);
  // مدیریت رسانه از جدول مستقل انجام می‌شود تا ساختار دوره‌ها/پرونده‌ها دست‌نخورده بماند.
  const mediaSection = el('section', { class: 'admin-media-section' }, [
    el('h2', { text: 'مدیریت رسانه و اندیشه' }),
    el('p', { class: 'muted', text: 'مقاله‌ها و قسمت‌های پادکست ابتدا به‌صورت پیش‌نویس ثبت می‌شوند. انتشار فقط پس از بازبینی علمی انجام شود.' }),
  ]);
  const mediaNotice = el('p', { class: 'form-status', role: 'status' });
  const mediaForm = el('form', { class: 'admin-form card' });
  const mediaKind = el('select', { name: 'kind', required: 'true', 'aria-label': 'نوع رسانه' }, [
    el('option', { value: 'article', text: 'مقاله' }), el('option', { value: 'episode', text: 'قسمت پادکست' }),
  ]);
  const mediaStatus = el('select', { name: 'status', required: 'true', 'aria-label': 'وضعیت انتشار رسانه' }, [
    el('option', { value: 'draft', text: 'پیش‌نویس' }), el('option', { value: 'published', text: 'منتشرشده' }),
  ]);
  const mSlug = field('شناسهٔ انگلیسی', 'mediaSlug');
  const mTitle = field('عنوان رسانه', 'mediaTitle');
  const mSummary = field('خلاصه (۱۰ تا ۶۰۰ نویسه)', 'mediaSummary', '', 'textarea');
  const mAuthor = field('نویسنده (مقاله)', 'mediaAuthor', 'تحریریهٔ آکادمی وکالت شهرام مختاری');
  const mBody = field('متن مقاله؛ هر بند یک خط و حداقل ۲۰ نویسه', 'mediaBody', '', 'textarea');
  const mDate = field('تاریخ انتشار YYYY-MM-DD', 'mediaDate', new Date().toISOString().slice(0, 10));
  const mDescription = field('توضیحات قسمت پادکست', 'mediaDescription', '', 'textarea');
  const mDuration = field('مدت به دقیقه (اختیاری)', 'mediaDuration', '', 'number', false);
  const mAudio = field('نشانی HTTPS فایل صوتی (اختیاری)', 'mediaAudio', '', 'url', false);
  const mediaSubmit = el('button', { class: 'btn', type: 'submit', text: 'ثبت رسانه' });
  mediaForm.append(
    el('label', { class: 'admin-field' }, [el('span', { text: 'نوع رسانه' }), mediaKind]), mSlug, mTitle, mSummary,
    el('label', { class: 'admin-field' }, [el('span', { text: 'وضعیت' }), mediaStatus]), mAuthor, mBody, mDate, mDescription, mDuration, mAudio, mediaSubmit
  );
  const mediaList = el('div', { class: 'admin-content-list' });
  mediaSection.append(mediaNotice, mediaForm, el('h3', { text: 'رسانه‌های ثبت‌شده' }), mediaList);
  mediaView.append(mediaSection);
  function showMediaFields() {
    const article = mediaKind.value === 'article';
    for (const node of [mAuthor, mBody]) node.hidden = !article;
    for (const node of [mDescription, mDuration, mAudio]) node.hidden = article;
    mAuthor.querySelector('input').required = article;
    mBody.querySelector('textarea').required = article;
    mDescription.querySelector('textarea').required = !article;
  }
  async function refreshMedia() {
    const result = await getJson('/api/admin/media');
    if (!result.ok) { mediaNotice.className = 'form-status err'; mediaNotice.textContent = errorText(result.data, result.status); mediaForm.hidden = true; mediaList.replaceChildren(); return; }
    mediaForm.hidden = false; mediaNotice.className = 'form-status'; mediaNotice.textContent = `${result.data.items.length} رسانه دریافت شد.`; mediaList.replaceChildren();
    updateDashboard();
    if (!result.data.items.length) mediaList.append(el('p', { class: 'muted', text: 'رسانهٔ مدیریتی ثبت نشده است.' }));
    for (const item of result.data.items) {
      const row = el('article', { class: 'admin-content-row card' }, [el('div', {}, [el('span', { class: 'badge', text: `${item.kind === 'article' ? 'مقاله' : 'پادکست'} · ${item.status === 'published' ? 'منتشرشده' : 'پیش‌نویس'}` }), el('h3', { text: item.title }), el('p', { class: 'muted', text: `${item.slug} — ${item.summary}` })])]);
      const actions = el('div', { class: 'row admin-actions' });
      const toggle = el('button', { class: 'btn secondary', type: 'button', text: item.status === 'published' ? 'خروج از انتشار' : 'انتشار' });
      toggle.addEventListener('click', async () => {
        const res = await sendJson('PATCH', `/api/admin/media/${item.id}`, { status: item.status === 'published' ? 'draft' : 'published' });
        mediaNotice.className = `form-status${res.ok ? '' : ' err'}`; mediaNotice.textContent = res.ok ? 'وضعیت رسانه تغییر کرد.' : errorText(res.data, res.status); if (res.ok) await refreshMedia();
      });
      actions.append(toggle);
      if (item.status === 'draft') {
        const remove = el('button', { class: 'btn danger', type: 'button', text: 'حذف پیش‌نویس' });
        remove.addEventListener('click', async () => { if (!window.confirm('این پیش‌نویس رسانه حذف شود؟')) return; const res = await sendJson('DELETE', `/api/admin/media/${item.id}`); mediaNotice.className = `form-status${res.ok ? '' : ' err'}`; mediaNotice.textContent = res.ok ? 'پیش‌نویس حذف شد.' : errorText(res.data, res.status); if (res.ok) await refreshMedia(); });
        actions.append(remove);
      }
      row.append(actions); mediaList.append(row);
    }
  }
  mediaKind.addEventListener('change', showMediaFields);
  mediaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const article = mediaKind.value === 'article';
    const payload = article
      ? { author: mAuthor.querySelector('input').value.trim(), body: parseLines(mBody.querySelector('textarea').value), publishedAt: mDate.querySelector('input').value }
      : { description: mDescription.querySelector('textarea').value.trim(), publishedAt: mDate.querySelector('input').value, durationMinutes: mDuration.querySelector('input').value ? Number(mDuration.querySelector('input').value) : null, audioUrl: mAudio.querySelector('input').value.trim() || null };
    const body = { kind: mediaKind.value, slug: mSlug.querySelector('input').value.trim(), title: mTitle.querySelector('input').value.trim(), summary: mSummary.querySelector('textarea').value.trim(), status: mediaStatus.value, payload };
    const result = await postJson('/api/admin/media', body);
    mediaNotice.className = `form-status${result.ok ? '' : ' err'}`; mediaNotice.textContent = result.ok ? 'رسانه ثبت شد.' : errorText(result.data, result.status);
    if (result.ok) { mediaForm.reset(); mediaStatus.value = 'draft'; mAuthor.querySelector('input').value = 'تحریریهٔ آکادمی وکالت شهرام مختاری'; mDate.querySelector('input').value = new Date().toISOString().slice(0, 10); await refreshMedia(); }
  });
  showMediaFields();
  showKindFields();

  // پنل را منتظر پاسخ‌های مستقل API نمی‌گذاریم؛ هر سه منبع هم‌زمان دریافت می‌شوند.
  mediaNotice.textContent = 'در حال دریافت رسانه‌ها…';
  notice.textContent = 'در حال دریافت محتوا…';
  importStatus.textContent = 'در حال دریافت آمار بانک پرونده‌ها…';
  void Promise.all([refreshMedia(), refresh(), refreshImportStatus()]);

  const dashboardCards = el('div', { class: 'admin-dashboard-grid' });
  const dashboardActivity = el('div', { class: 'admin-dashboard-activity' });
  const dashboardChart = el('section', { class: 'admin-dashboard-panel card' });
  const dashboardEvents = el('section', { class: 'admin-dashboard-panel card' });
  const dashboardViewHeader = el('header', { class: 'admin-dashboard-heading' }, [
    el('div', {}, [el('span', { class: 'section-kicker', text: 'مرکز فرماندهی آکادمی' }), el('h2', { text: 'نمای کلی سامانه' }), el('p', { class: 'muted', text: 'نمایی سریع از محتوا، انتشار و رخدادهای مهم سامانه' })]),
    el('span', { class: 'admin-live-indicator', text: 'نمای مدیریتی' }),
  ]);
  dashboardView.append(dashboardViewHeader, dashboardCards, el('div', { class: 'admin-dashboard-insights' }, [dashboardChart, dashboardEvents]));
  function updateDashboard() {
    const published = currentItems.filter((item) => item.status === 'published').length;
    const drafts = currentItems.length - published;
    const mediaCount = mediaList.querySelectorAll('.admin-content-row').length;
    const caseSummary = importStatus.textContent || 'آمار بانک تمرین هنوز دریافت نشده است.';
    const metrics = [
      ['محتوای آموزشی', currentItems.length, 'دوره و پرونده', '▤'],
      ['منتشرشده', published, 'محتوای در دسترس کاربران', '✓'],
      ['پیش‌نویس', drafts, 'نیازمند تکمیل یا بازبینی', '◷'],
      ['رسانه‌ها', mediaCount, 'مقاله و قسمت پادکست', '▧'],
    ];
    dashboardCards.replaceChildren(...metrics.map(([label, value, hint, icon]) => el('article', { class: 'admin-stat-card card' }, [
      el('span', { class: 'admin-stat-icon', 'aria-hidden': 'true', text: icon }),
      el('span', { class: 'admin-stat-label', text: label }),
      el('strong', { text: String(value) }),
      el('small', { text: hint }),
    ])));
    dashboardChart.replaceChildren(
      el('div', { class: 'admin-panel-heading' }, [el('div', {}, [el('h3', { text: 'ترکیب محتوای آموزشی' }), el('p', { class: 'muted', text: 'بر اساس وضعیت انتشار' })])]),
      el('div', { class: 'admin-chart-legend' }, [el('span', { text: 'منتشرشده' }), el('span', { text: 'پیش‌نویس' })]),
      ...[['منتشرشده', published, '#178579'], ['پیش‌نویس', drafts, '#c7a45b']].map(([label, value, color]) => {
        const track = el('div', { class: 'admin-chart-track' });
        track.append(el('span', { class: 'admin-chart-fill', style: `width:${currentItems.length ? Math.max(3, value / currentItems.length * 100) : 0}%;background:${color}` }));
        return el('div', { class: 'admin-chart-row' }, [el('div', { class: 'admin-chart-row-label' }, [el('span', { text: label }), el('strong', { text: String(value) })]), track]);
      }),
      el('p', { class: 'muted admin-chart-footnote', text: caseSummary }),
    );
    dashboardEvents.replaceChildren(
      el('div', { class: 'admin-panel-heading' }, [el('div', {}, [el('h3', { text: 'رخدادهای اخیر سامانه' }), el('p', { class: 'muted', text: 'گزارش‌های ثبت‌شده در مرکز سلامت' })]), el('button', { class: 'btn secondary admin-small-action', type: 'button', text: 'مشاهدهٔ همه' })]),
    );
    dashboardEvents.querySelector('button').addEventListener('click', () => selectView('services'));
    dashboardActivity.replaceChildren(el('p', { class: 'muted', text: 'برای دریافت رخدادها، داشبورد را تازه‌سازی کنید.' }));
    dashboardEvents.append(dashboardActivity);
    getJson('/api/admin/diagnostics').then((result) => {
      if (!result.ok) { dashboardActivity.replaceChildren(el('p', { class: 'muted', text: 'دریافت رخدادها ممکن نشد؛ از بخش سلامت سرویس‌ها بررسی کنید.' })); return; }
      const items = result.data.items || [];
      const openCount = result.data.openCount || 0;
      const summary = el('div', { class: 'admin-event-summary' }, [
        el('strong', { text: String(openCount) }), el('span', { text: 'رخداد باز برای بررسی' }),
      ]);
      const table = el('div', { class: 'admin-event-table-wrap' });
      const tableEl = el('table', { class: 'admin-event-table' });
      const head = el('thead', {}, [el('tr', {}, ['وضعیت','بخش','شرح رخداد','آخرین ثبت'].map((x) => el('th', { text: x })))]);
      const body = el('tbody');
      for (const item of items.slice(0, 6)) {
        const tr = el('tr', {}, [
          el('td', {}, [el('span', { class: `admin-event-status ${item.status === 'open' ? 'is-open' : 'is-closed'}`, text: item.status === 'open' ? 'باز' : 'بسته' })]),
          el('td', { text: item.component || '—' }),
          el('td', { text: item.detail || item.errorCode || 'رخداد ثبت‌شده' }),
          el('td', { text: item.lastSeen ? new Date(item.lastSeen).toLocaleDateString('fa-IR') : '—' }),
        ]);
        body.append(tr);
      }
      if (!items.length) body.append(el('tr', {}, [el('td', { colspan: '4', text: 'هنوز رخدادی ثبت نشده است.' })]));
      tableEl.append(head, body); table.append(tableEl);
      dashboardActivity.replaceChildren(summary, table);
    }).catch(() => dashboardActivity.replaceChildren(el('p', { class: 'muted', text: 'ارتباط با مرکز سلامت برقرار نشد.' })));
  }
  updateDashboard();

  const nav = el('nav', { class: 'admin-sidebar', 'aria-label': 'منوی مدیریت', id: 'admin-sidebar' }, [
    el('div', { class: 'admin-sidebar-brand' }, [el('span', { class: 'admin-sidebar-mark', text: 'و' }), el('div', {}, [el('strong', { text: 'مدیریت وفاق' }), el('small', { text: 'MOKHTARI LAW ACADEMY' })])]),
    el('p', { class: 'admin-sidebar-caption', text: 'فضای کاری مدیر' }),
  ]);
  const menuItems = [
    ['dashboard', 'داشبورد', '⌂'],
    ['content', 'دوره‌ها و پرونده‌ها', '▤'],
    ['members', 'مدیریت اعضا', '♙'],
    ['rejected-members', 'درخواست‌های ردشده', '⊘'], 
    ['imports', 'بانک پرونده و بارگذاری', '⇧'],
    ['legal-bank', 'بانک قوانین', '§'],
    ['media', 'رسانه و اندیشه', '▧'],
    ['classroom', 'کلاس آنلاین', '▣'],
    ['services', 'سلامت و عیب‌یابی', '⚙'],
    ['traffic', 'پایش زنده سایت', '◉'],
  ];
  const menuToggle = el('button', { class: 'admin-menu-toggle btn secondary', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'admin-sidebar' }, [el('span', { text: '☰' }), el('span', { text: ' منوی مدیریت' })]);
  const views = { dashboard: dashboardView, members: membersView, 'rejected-members': rejectedMembersView, content: contentView, imports: importView, 'legal-bank': legalBankView, media: mediaView, classroom: classroomView, services: servicesView, traffic: trafficView };
  function selectView(key) {
    if (key === 'dashboard') updateDashboard();
    if (key === 'members') refreshMembers();
    if (key === 'services') refreshDiagnostics();
    if (key === 'classroom') { void loadClassroomProvider().then(() => { syncClassroomProviderFields(); return refreshClassroomAdmin(); }); }
    if (key === 'legal-bank') refreshLegalBank();
    if (key === 'traffic' && !trafficView.dataset.loaded) {
      trafficView.dataset.loaded = '1';
      import('./visitor-analytics.js?v=20261119-dashboard').then(({ visitorAnalyticsPage }) => visitorAnalyticsPage())
        .then((page) => trafficView.replaceChildren(page))
        .catch(() => { trafficView.textContent = 'بارگذاری مرکز پایش سایت ناموفق بود؛ صفحه را دوباره باز کنید.'; delete trafficView.dataset.loaded; });
    }
    for (const [name, view] of Object.entries(views)) view.hidden = name !== key;
    for (const button of nav.querySelectorAll('[data-admin-target]')) {
      const active = button.dataset.adminTarget === key;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
  for (const [key, label, symbol] of menuItems) {
    const button = el('button', { class: 'admin-nav-item', type: 'button', 'data-admin-target': key }, [
      el('span', { class: 'admin-nav-icon', 'aria-hidden': 'true', text: symbol }),
      el('span', { text: label }),
    ]);
    button.addEventListener('click', () => selectView(key));
    nav.append(button);
  }
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  const workspace = el('div', { class: 'admin-workspace admin-workspace-redesigned' }, [nav, el('div', { class: 'admin-main-column' }, [menuToggle, dashboardView, membersView, rejectedMembersView, contentView, importView, legalBankView, mediaView, classroomView, servicesView, trafficView])]);
  wrap.append(workspace);
  return wrap;
}
