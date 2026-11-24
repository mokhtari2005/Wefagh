import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEvidenceSources } from '../worker/src/ai/routes.js';

const prompt = readFileSync(new URL('../worker/src/ai/prompts.js', import.meta.url), 'utf8');

test('پروتکل کنترل استناد حقوقی در دستور سیستمی ثبت شده است', () => {
  assert.match(prompt, /پروتکل اجباری کنترل استناد در همه پاسخ‌های حقوقی/u);
  assert.match(prompt, /عنوان و تاریخ تصویب قانون یا مقرره/u);
  assert.match(prompt, /شماره ماده و موضوع واقعی همان ماده/u);
  assert.match(prompt, /اعتبار زمانی/u);
  assert.match(prompt, /ارتباط مستقیم ماده با گزاره/u);
  assert.match(prompt, /صلاحیت مرجع و تشریفات قانونی جاری/u);
  assert.match(prompt, /مواد نامرتبط اضافه نکن/u);
});

test('نمونه شارژ ساختمان به‌عنوان آزمون رگرسیون حقوقی پوشش داده شده است', () => {
  assert.match(prompt, /قانون تملک آپارتمان‌ها مصوب ۱۳۴۳ با اصلاحات بعدی/u);
  assert.match(prompt, /ماده ۴ این قانون مبنای مشارکت در هزینه‌های مشترک/u);
  assert.match(prompt, /ماده ۱۰ مکرر مسیر اختصاصی مطالبه و ضمانت‌اجرا/u);
  assert.match(prompt, /مهلت ده‌روزه از تاریخ ابلاغ/u);
  assert.match(prompt, /تبصره ۱ ماده ۱۰ مکرر/u);
  assert.match(prompt, /ماده ۲۲ آیین‌نامه اجرایی قانون تملک آپارتمان‌ها/u);
  assert.match(prompt, /ماده ۳۰۶ قانون آیین دادرسی مدنی مربوط به واخواهی از حکم غیابی/u);
  assert.match(prompt, /مواد ۳۳۶ و ۴۴۳ تا ۴۴۵/u);
  assert.match(prompt, /مسئولیت مالک و استفاده‌کننده\/مستأجر/u);
  assert.match(prompt, /قانون جاری شوراهای حل اختلاف و صلاحیت دادگاه صلح/u);
});


test('جست‌وجوی جایگزین منابع رسمی برای تصادف عابر پیاده تعریف شده است', async () => {
  const { buildSafeLegalSearchQuery } = await import('../worker/src/ai/legal-search.js');
  const query = buildSafeLegalSearchQuery('تصادف رانندگی با عابر پیاده و مسئولیت راننده');
  assert.match(query, /قانون بیمه اجباری خسارات واردشده به شخص ثالث/u);
  assert.match(query, /قانون رسیدگی به تخلفات رانندگی/u);
  assert.match(query, /مسئولیت راننده در تصادف با عابر پیاده/u);
  assert.doesNotMatch(query, /شهرام مختاری|علیرضا/u);
});

test('دستورالعمل، جست‌وجوی جایگزین را پیش از خالی گذاشتن مستند الزامی می‌کند', () => {
  assert.match(prompt, /پیدا نشدن مستند در بانک داخلی پایان تحقیق نیست/u);
  assert.match(prompt, /جست‌وجوی جایگزین در سامانه ملی قوانین و مقررات/u);
  assert.match(prompt, /انجام‌نشدن بازبینی مستقل/u);
});


test('جست‌وجوی منابع رسمی در پاسخ‌های حقوقی با پرچم اختیاری خاموش نمی‌شود', () => {
  const legalSearch = readFileSync(new URL('../worker/src/ai/legal-search.js', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../worker/src/ai/routes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(legalSearch, /GEMINI_SEARCH_GROUNDING_ENABLED === 'false'/u);
  assert.match(routes, /\['consult', 'litigation', 'draft', 'analyze', 'research'\]\.includes\(mode\)/u);
});


test('منابع بازیابی‌شده از بانک و جست‌وجو با وضعیت و پیوند امن از هم تفکیک می‌شوند', () => {
  const sources = buildEvidenceSources({
    legalArticles: [{
      lawTitle: 'قانون مدنی',
      articleNumber: '۱۰',
      sourceName: 'بانک حقوقی',
      sourceUrl: 'https://qavanin.ir/law/10',
      body: 'قراردادهای خصوصی نسبت به کسانی که آن را منعقد نموده‌اند نافذ است.',
    }],
    judicialAuthorities: [{
      lawTypeLabel: 'رأی وحدت رویه هیأت عمومی دیوان عالی کشور',
      lawTitle: 'رأی وحدت رویه نمونه',
      documentNumber: '۸۱۲',
      issuingAuthority: 'دیوان عالی کشور',
      officialSourceUrl: 'https://divan-edalat.ir/decision/812',
      body: 'متن رأی نمونه',
    }],
    webSources: [
      { title: 'نتیجه رسمی', uri: 'https://rrk.ir/law', domain: 'rrk.ir', pageTextStatus: 'official_domain_page_text_retrieved', supportedClaim: 'متن صفحه رسمی' },
      { title: 'نتیجه ثانویه', uri: 'https://example.com/law', domain: 'example.com', pageTextStatus: 'not_primary_source_domain', supportedClaim: 'صرفاً سرنخ' },
      { title: 'پیوند ناامن', uri: 'javascript:alert(1)', domain: 'unsafe.test', pageTextStatus: 'not_primary_source_domain' },
    ],
  });
  assert.equal(sources.length, 5);
  assert.equal(sources[0].type, 'قانون یا مقرره');
  assert.equal(sources[0].url, 'https://qavanin.ir/law/10');
  assert.equal(sources[1].type, 'رأی یا نظریه قضایی');
  assert.match(sources[2].status, /متن صفحه از دامنه رسمی بازیابی شد/u);
  assert.match(sources[3].status, /دامنه رسمی احراز نشد/u);
  assert.equal(sources[4].url, '', 'پیوند ناامن باید بدون href باقی بماند');
});
