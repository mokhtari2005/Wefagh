import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../site/js/assistant.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../site/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/css/styles.css', import.meta.url), 'utf8');
const prompt = readFileSync(new URL('../worker/src/ai/prompts.js', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../worker/src/ai/routes.js', import.meta.url), 'utf8');

test('مشاوره هوشمند مستقیماً با محیط یکپارچه متنی و صوتی باز می‌شود', () => {
  assert.match(source, /if \(initialMode === 'consult'\) openWorkspace\('smart'\)/u);
  assert.match(source, /else body\.replaceChildren\(methodChooser\(openWorkspace, chooserTitle\)\)/u);
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

test('پرسش‌های پیشنهادی آغاز مشاوره حذف شده‌اند و کادر نوشتن حفظ شده است', () => {
  assert.match(source, /const composerText = h\('textarea'/u);
  assert.doesNotMatch(source, /starterSuggestions|ai-starter-suggestions|SUGGESTIONS|renderSuggestions/u);
  assert.doesNotMatch(source, /برای شروع، یکی از این موضوع‌ها را انتخاب کنید/u);
  assert.match(css, /\.ai-chat-composer \{ width: 100%/u);
  assert.match(css, /\.ai-chat-composer \.ai-chat-input \{ display: block; width: 100%/u);
});

test('پرسش‌های مشاوره در متن اصلی نمایش داده نمی‌شوند', () => {
  assert.match(source, /export function summarizeReply\(data, mode = ''\)/u);
  assert.match(source, /if \(mode === 'consult'\) return data\.text \|\| ''/u);
  assert.doesNotMatch(source, /if \(Array\.isArray\(m\.questionOptions\)/u);
  assert.match(source, /m\.reviewReport\?\.followupQuestions/u);
  assert.match(source, /'aria-label': 'پرسش‌های تکمیلی گزارش بازبینی'/u);
  assert.match(routes, /followupQuestions: reviewFollowups/u);
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

test('ساختار پرسش‌های تکمیلی اختیاری است و فقط برای گزارش مستقل تولید می‌شود', () => {
  assert.match(prompt, /required: \['status', 'questions', 'text', 'notes'\]/u);
  assert.doesNotMatch(prompt, /حتماً یک مورد در questionOptions تولید کن/u);
  assert.match(prompt, /پرسش‌های تکمیلی، فهرست ابهام‌ها یا گزینه‌های انتخابی را در متن پاسخ اصلی تکرار نکند/u);
  assert.match(prompt, /صرفاً برای گزارش بازبینی مستقل/u);
});

test('بارگذاری دستیار نسخه تازه رابط را دریافت می‌کند و در انتظار نامحدود نمی‌ماند', () => {
  assert.match(html, /js\/app\.js\?v=20261123-consult-ui-refresh-2/u);
  assert.match(app, /assistant\.js\?v=20261123-consult-ui-refresh-3/u);
  assert.match(app, /assistant-forms\.js\?v=20261123-consult-ui-refresh-2/u);
  assert.match(app, /timeoutMs = 20000/u);
  assert.match(app, /page_load_timeout/u);
  assert.match(app, /تلاش دوباره/u);
});
