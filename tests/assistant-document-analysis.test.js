import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantSystemPrompt } from '../worker/src/ai/prompts.js';

test('تحلیل پیوست باید یافته‌ها را به محل واقعی در سند متصل کند و از ساختن صفحه یا نقل‌قول منع شود', () => {
  const prompt = assistantSystemPrompt({ mode: 'analyze', hasAttachments: true });
  assert.match(prompt, /نام دقیق فایل و محل آن/u);
  assert.match(prompt, /شماره صفحه فقط وقتی که واقعاً از سند قابل تشخیص است/u);
  assert.match(prompt, /هرگز شماره صفحه، بند، نقل‌قول/u);
  assert.match(prompt, /اصالت یا اعتبار حقوقی آن را اثبات نمی‌کند/u);
  assert.match(prompt, /ناخوانایی، کیفیت پایین اسکن/u);
});

test('قواعد ویژه تحلیل پیوست بدون فایل به مشاوره متنی تحمیل نمی‌شود', () => {
  const prompt = assistantSystemPrompt({ mode: 'consult', hasAttachments: false });
  assert.doesNotMatch(prompt, /قواعد تحلیل سند و پیوست/u);
});
