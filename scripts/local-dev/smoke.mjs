// آزمون یکپارچگی API. پیش از اجرا سرور را با devserver.mjs روی پورت دلخواه اجرا کنید؛ BASE را تنظیم کنید.
const BASE = process.env.BASE || 'http://localhost:8093';
const results = [];
function rec(name, ok, detail) { results.push(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); }
async function login(email, password) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
async function call(cookie, method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const STAGE_OK = process.env.STAGE_OK || 'answers';
const tester = await login('tester@example.test', 'رمز-آزمایشی-۱۴۰۵');
const manager = await login('manager@example.test', 'رمز-مدیر-آزمایشی-۱۴۰۵');

// مدیر: ایجاد پیش‌نویس دوره
const courseBody = { kind: 'course', slug: 'smoke-course', title: 'دوره آزمایشی', summary: 'خلاصهٔ آزمایشی برای آزمون یکپارچگی API.', status: 'draft', payload: { level: 'مقدماتی', lessons: [{ id: 'l1', title: 'درس اول', body: 'متن درس اول برای آزمون یکپارچگی سیستم.' }] } };
let r = await call(manager, 'POST', '/api/admin/content', courseBody);
rec('مدیر: ایجاد پیش‌نویس دوره', r.status === 201, `status=${r.status}`);
const courseId = r.data?.id;
// کاربر عادی: نباید بتواند ایجاد کند
r = await call(tester, 'POST', '/api/admin/content', { ...courseBody, slug: 'smoke-x' });
rec('کاربر عادی: ایجاد محتوا ممنوع (۴۰۳)', r.status === 403, `status=${r.status}`);
// دوره پیش‌نویس در فهرست عمومی نیست
r = await call(null, 'GET', '/api/academy/courses');
rec('پیش‌نویس در فهرست عمومی دیده نمی‌شود', !r.data.courses.some((c) => c.id === 'smoke-course'), `count=${r.data.courses.length}`);
// انتشار
r = await call(manager, 'PATCH', `/api/admin/content/${courseId}`, { status: 'published' });
rec('مدیر: انتشار دوره', r.status === 200, `status=${r.status}`);
r = await call(null, 'GET', '/api/academy/courses');
rec('دوره منتشرشده در فهرست عمومی است', r.data.courses.some((c) => c.id === 'smoke-course'), `count=${r.data.courses.length}`);
r = await call(null, 'GET', '/api/academy/courses/smoke-course');
rec('جزئیات دوره منتشرشده بازیابی می‌شود', r.status === 200 && r.data?.course?.lessons?.length === 1, `status=${r.status}`);
// ویرایش با داده نامعتبر باید رد شود
r = await call(manager, 'PATCH', `/api/admin/content/${courseId}`, { payload: { level: 'x', lessons: [] } });
rec('ویرایش با داده نامعتبر رد می‌شود (۴۲۲)', r.status === 422, `status=${r.status}`);
// حذف محتوای منتشرشده ممنوع
r = await call(manager, 'DELETE', `/api/admin/content/${courseId}`);
rec('حذف محتوای منتشرشده بدون لغو انتشار ممنوع (۴۰۹)', r.status === 409, `status=${r.status}`);
// پرونده آموزشی: ایجاد، ویرایش و نمایش
const caseBody = { kind: 'case', slug: 'smoke-case', title: 'پروندهٔ آزمایشی', summary: 'پروندهٔ فرضی آموزشی برای آزمون یکپارچگی.', status: 'published', payload: { area: 'حقوق مدنی', level: 'مقدماتی', facts: ['واقعهٔ فرضی یک'], evidence: ['سند فرضی یک'], issues: [{ id: 'i1', text: 'مسئلهٔ فرضی برای بحث دانشجو' }] } };
r = await call(manager, 'POST', '/api/admin/content', caseBody);
rec('مدیر: ایجاد پروندهٔ فرضی', r.status === 201, `status=${r.status}`);
const caseId = r.data?.id;
r = await call(null, 'GET', '/api/cases');
rec('پروندهٔ منتشرشده در بانک پرونده‌ها', r.data.cases.some((c) => c.id === 'smoke-case' || c.title === 'پروندهٔ آزمایشی'), `total=${r.data.total}`);
r = await call(manager, 'PATCH', `/api/admin/content/${caseId}`, { title: 'پروندهٔ آزمایشی ویرایش‌شده' });
rec('مدیر: ویرایش عنوان پرونده', r.status === 200, `status=${r.status}`);
r = await call(null, 'GET', '/api/cases');
rec('ویرایش در بانک پرونده دیده می‌شود', r.data.cases.some((c) => c.title === 'پروندهٔ آزمایشی ویرایش‌شده'), '');
// نامعتبر: پروندهٔ بدون مسئله
r = await call(manager, 'POST', '/api/admin/content', { ...caseBody, slug: 'smoke-case-bad', payload: { area: 'حقوق', level: 'x', facts: [], evidence: [], issues: [] } });
rec('پروندهٔ نامعتبر رد می‌شود (۴۲۲)', r.status === 422, `status=${r.status}`);
// شناسهٔ تکراری
r = await call(manager, 'POST', '/api/admin/content', courseBody);
rec('شناسهٔ تکراری رد می‌شود (۴۰۹)', r.status === 409, `status=${r.status}`);
// دسترسی بدون ورود
r = await call(null, 'GET', '/api/admin/content');
rec('بدون ورود به مدیریت دسترسی نیست (۴۰۱)', r.status === 401, `status=${r.status}`);
// جلسهٔ موت‌کورت: ذخیره، بازیابی، خطای اعتبارسنجی
const sessBody = { title: 'تمرین آزمایشی', caseId: 'contract-delivery-delay', answers: { issues: 'پاسخ آزمایشی' }, rubric: [true, false], stage: STAGE_OK, score: 3 };
r = await call(tester, 'POST', '/api/moot/sessions', sessBody);
rec('موت‌کورت: ذخیرهٔ تمرین', r.status === 201 && !!r.data?.id, `status=${r.status}`);
globalThis.SID = r.data?.id;
r = await call(tester, 'GET', '/api/moot/sessions');
rec('موت‌کورت: بازیابی تمرین‌ها', r.status === 200 && r.data.sessions.length >= 1, `count=${r.data?.sessions?.length}`);
const sid = globalThis.SID;
r = await call(manager, 'GET', `/api/moot/sessions/${sid}`);
rec('موت‌کورت: دسترسی دیگران به تمرین ممنوع (۴۰۴)', r.status === 404, `status=${r.status}`);
r = await call(tester, 'PATCH', `/api/moot/sessions/${sid}`, { answers: { issues: 'پاسخ ویرایش‌شده' } });
rec('موت‌کورت: ویرایش تمرین توسط صاحب آن', r.status === 200, `status=${r.status}`);
r = await call(null, 'POST', '/api/moot/sessions', sessBody);
rec('موت‌کورت: بدون ورود ذخیره ممنوع (۴۰۱)', r.status === 401, `status=${r.status}`);
r = await call(tester, 'POST', '/api/moot/sessions', { title: '', caseId: '', answers: 'x' });
rec('موت‌کورت: داده نامعتبر رد می‌شود (۴۲۲)', r.status === 422, `status=${r.status}`);
// تقویم: مهلت با تاریخ نامعتبر
r = await call(tester, 'POST', '/api/deadlines', { title: 'بد', due: '1300/13/45', kind: 'hearing' });
rec('تقویم: تاریخ شمسی نامعتبر رد می‌شود', r.status >= 400 && r.status < 500, `status=${r.status}`);
// خطای سرور بدون افشای جزئیات
r = await call(null, 'GET', '/api/unknown-endpoint');
rec('مسیر ناشناخته ۴۰۴ می‌دهد', r.status === 404, `status=${r.status}`);

console.log(results.join('\n'));
console.log(`\nجمع: ${results.filter((x) => x.startsWith('PASS')).length} موفق، ${results.filter((x) => x.startsWith('FAIL')).length} ناموفق`);
