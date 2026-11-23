import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeReply } from '../site/js/assistant.js';

const source = readFileSync(new URL('../site/js/assistant.js', import.meta.url), 'utf8');
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

test('کادر نوشتن و گزینه‌های آغاز مشاوره حفظ می‌شوند', () => {
  assert.match(source, /const composerText = h\('textarea'/u);
  assert.match(source, /const starterSuggestions = h\('div', \{ class: 'ai-starter-suggestions'/u);
});

test('پرسش‌های مشاوره در متن اصلی نمایش داده نمی‌شوند', () => {
  assert.match(source, /export function summarizeReply\(data, mode = ''\)/u);
  assert.match(source, /if \(mode === 'consult'\) return data\.text \|\| ''/u);
  assert.doesNotMatch(source, /if \(Array\.isArray\(m\.questionOptions\)/u);
  assert.match(source, /m\.reviewReport\?\.followupQuestions/u);
  assert.match(source, /aria-label: 'پرسش‌های تکمیلی گزارش بازبینی'/u);
  assert.match(routes, /followupQuestions: reviewFollowups/u);
});

test('گزارش بازبینی مستقل پرسش‌های ساخت‌یافته و آزاد را دریافت می‌کند', () => {
  assert.match(routes, /\.\.\.questionOptions/u);
  assert.match(routes, /questions\.filter\(/u);
  assert.match(routes, /reviewReport = review\.review/u);
});

test('پاسخ اصلی مشاوره فقط متن تحلیل را نشان می‌دهد و گزارش مستقل جدا می‌ماند', () => {
  assert.equal(summarizeReply({ status: 'need_info', text: 'تحلیل مقدماتی', questions: ['پرسش تکمیلی'] }, 'consult'), 'تحلیل مقدماتی');
  assert.equal(summarizeReply({ status: 'need_info', text: 'پیش‌نویس', questions: ['نام طرف'] }, 'draft'), 'برای ادامه این اطلاعات لازم است:\n- نام طرف');
});

test('ساختار پرسش‌های تکمیلی اختیاری است و فقط برای گزارش مستقل تولید می‌شود', () => {
  assert.match(prompt, /required: \['status', 'questions', 'text', 'notes'\]/u);
  assert.doesNotMatch(prompt, /حتماً یک مورد در questionOptions تولید کن/u);
  assert.match(prompt, /پرسش‌های تکمیلی، فهرست ابهام‌ها یا گزینه‌های انتخابی را در متن پاسخ اصلی تکرار نکند/u);
  assert.match(prompt, /صرفاً برای گزارش بازبینی مستقل/u);
});
