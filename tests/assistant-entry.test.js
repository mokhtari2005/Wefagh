import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../site/js/assistant.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../site/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/css/styles.css', import.meta.url), 'utf8');
const prompt = readFileSync(new URL('../worker/src/ai/prompts.js', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../worker/src/ai/routes.js', import.meta.url), 'utf8');

test('همهٔ بخش‌های دستیار مستقیماً محیط یکپارچهٔ متنی و صوتی را باز می‌کنند', () => {
  assert.match(source, /assistantWorkspace\(guestMode \? null : params\.thread, guestMode, 'smart', initialMode\)/u);
  assert.doesNotMatch(source, /methodChooser|پاسخ‌گویی متنی/u);
  assert.match(source, /پیام خود را برای دستیار بنویسید/u);
  assert.match(source, /voicePanel\.hidden = !voiceAllowed/u);
});

test('پس از دریافت پاسخ، کادر گفت‌وگو و آخرین پیام در محدوده دید قرار می‌گیرند', () => {
  assert.match(source, /stream\.scrollIntoView\(\{ behavior: 'smooth', block: 'center'/u);
  assert.match(source, /stream\.scrollTo\(\{ top: stream\.scrollHeight, behavior: 'smooth' \}\)/u);
  assert.doesNotMatch(source, /log\.lastElementChild\?\.scrollIntoView/u);
});

test('محیط گفت‌وگو وضعیت خالی را تعریف می‌کند و بدون خطای مرجع ساخته می‌شود', () => {
  assert.match(source, /const emptyState = h\('div', \{ class: 'ai-empty' \}/u);
  assert.match(source, /const stream = h\('div', \{ class: 'ai-stream', tabindex: '-1' \}, \[emptyState, log\]\)/u);
});

test('خطای ساخت مشاوره مرحله و جزئیات فنی امن و کوتاه را برای عیب‌یابی نمایش می‌دهد', () => {
  assert.match(source, /let accessCheckStage = 'شروع بررسی'/u);
  assert.match(source, /accessCheckStage = 'ساخت محیط گفت‌وگو'/u);
  assert.match(source, /جزئیات فنی برای پشتیبانی/u);
  assert.match(source, /slice\(0, 180\)/u);
  assert.match(source, /assistant\.access_check_failed', \{ stage: accessCheckStage/u);
});

test('پرسش‌های پیشنهادی آغاز مشاوره حذف شده‌اند و کادر نوشتن حفظ شده است', () => {
  assert.match(source, /const composerText = h\('textarea'/u);
  assert.doesNotMatch(source, /starterSuggestions|ai-starter-suggestions|SUGGESTIONS|renderSuggestions/u);
  assert.doesNotMatch(source, /برای شروع، یکی از این موضوع‌ها را انتخاب کنید/u);
  assert.match(css, /\.ai-main > \.ai-chat-composer[\s\S]*?width: 100%/u);
  assert.match(css, /\.ai-main > \.ai-chat-composer > \.ai-chat-input[\s\S]*?width: 100%/u);
});

test('پرسش‌ها و گزینه‌های تکمیلی در جریان اصلی مشاوره نمایش داده می‌شوند', () => {
  assert.match(source, /if \(mode === 'consult'\) return data\.text \|\| ''/u);
  assert.match(source, /questionOptions: Array\.isArray\(res\.data\.questionOptions\)/u);
  assert.match(source, /'aria-label': 'پرسش‌های تکمیلی مشاوره'/u);
  assert.match(source, /پاسخ انتخاب‌شده:/u);
  assert.match(routes, /questionOptions,/u);
  assert.match(routes, /reviewFollowups: reviewFollowups/u);
});

test('گزارش بازبینی مستقل پرسش‌های ساخت‌یافته و آزاد را دریافت می‌کند', () => {
  assert.match(routes, /\.\.\.questionOptions/u);
  assert.match(routes, /questions\.filter\(/u);
  assert.match(routes, /reviewReport = review\.review/u);
});

test('پاسخ اصلی مشاوره فقط متن تحلیل را نشان می‌دهد و گزارش مستقل جدا می‌ماند', () => {
  assert.match(source, /if \(mode === 'consult'\) return data\.text \|\| ''/u);
  assert.match(source, /freeQuestions\.map\(\(question\) => `- \$\{question\}`\)/u);
});

test('دستور مشاوره تولید و نمایش پرسش‌های تکمیلی را به گزارش مستقل محدود نمی‌کند', () => {
  assert.match(prompt, /required: \['status', 'questions', 'text', 'notes'\]/u);
  assert.match(prompt, /در جریان اصلی مشاوره به کاربر نمایش داده شوند/u);
  assert.doesNotMatch(prompt, /صرفاً برای گزارش بازبینی مستقل/u);
});

test('بارگذاری دستیار نسخه تازه رابط را دریافت می‌کند و در انتظار نامحدود نمی‌ماند', () => {
  assert.match(html, /js\/app\.js\?v=20261126-home-hero-preload-1/u);
  assert.match(html, /css\/styles\.css\?v=20261125-gpt-primary-ui-1/u);
  assert.match(app, /assistant\.js\?v=20261126-assistant-config-split-1/u);
  assert.match(app, /assistant-forms\.js\?v=20261126-assistant-config-split-1/u);
  assert.match(app, /timeoutMs = 20000/u);
  assert.match(app, /page_load_timeout/u);
  assert.match(app, /تلاش دوباره/u);
});


test('خطای ارائه‌دهنده، شکست مسیر جایگزین یا محدودیت محرمانگی پیوست را روشن می‌کند', () => {
  assert.match(source, /fallbackInfo = res\.data\?\.fallbackCode/u);
  assert.match(source, /مسیر جایگزین Groq نیز موفق نشد/u);
  assert.match(source, /به‌دلیل وجود پیوست، برای حفظ محرمانگی/u);
  assert.match(source, /fallbackStatus/u);
  assert.match(readFileSync(new URL('../site/js/ai-client.js', import.meta.url), 'utf8'), /سرویس اصلی هوش مصنوعی موقتاً پاسخ قابل استفاده‌ای/u);
});