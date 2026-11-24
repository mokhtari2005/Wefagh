import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSISTANT_SCHEMA, assistantSystemPrompt } from '../worker/src/ai/prompts.js';

test('ساختار پاسخ مشاوره از پرسش‌های چندگزینه‌ای کنترل‌شده پشتیبانی می‌کند', () => {
  const options = ASSISTANT_SCHEMA.properties.questionOptions;
  assert.equal(options.type, 'ARRAY');
  assert.equal(options.items.type, 'OBJECT');
  assert.ok(options.items.properties.options);
  assert.ok(options.items.properties.allowOther);
  assert.ok(ASSISTANT_SCHEMA.properties.suggestedDocType);
  assert.ok(ASSISTANT_SCHEMA.properties.suggestedDocType.enum.every((value) => value.length > 0));
  assert.ok(ASSISTANT_SCHEMA.properties.knownFields);
});

test('دستور مشاوره گزینه‌های واقعی و امکان توضیح آزاد را پیش‌بینی می‌کند', () => {
  const prompt = assistantSystemPrompt({ mode: 'consult', docType: 'petition' });
  assert.match(prompt, /questionOptions/u);
  assert.match(prompt, /صرفاً برای گزارش بازبینی مستقل/u);
  assert.match(prompt, /گزینه ساختگی نساز/u);
  assert.match(prompt, /knownFields/u);
  assert.match(prompt, /حدس نزن/u);
  assert.match(prompt, /مناسب‌ترین نوع سند/u);
});
test('پیشنهاد نوع سند در صورت نامشخص بودن حذف می‌شود و مقدار خالی در فهرست مجاز نیست', () => {
  const allowed = ASSISTANT_SCHEMA.properties.suggestedDocType.enum;
  assert.ok(allowed.length > 0);
  assert.ok(allowed.every((value) => typeof value === 'string' && value.trim().length > 0));
  const prompt = assistantSystemPrompt({ mode: 'consult' });
  assert.match(prompt, /فیلد suggestedDocType را در خروجی نیاور/u);
});


test('کاربر می‌تواند از پاسخ به پرسش تکمیلی بگذرد و مشاوره را ادامه دهد', () => {
  const ui = readFileSync(new URL('../site/js/assistant.js', import.meta.url), 'utf8');
  assert.match(ui, /فعلاً از پاسخ به این پرسش می‌گذرم/u);
  assert.match(ui, /فعلاً اطلاعاتی برای پاسخ به این پرسش ندارم/u);
  assert.match(ui, /m\.metadata && typeof m\.metadata === 'object'/u);
  assert.match(ui, /history\.push\(\{ role, text: m\.content, \.\.\.metadata \}\)/u);
  assert.match(ui, /latest\.status === 'ready'/u);
  assert.match(ui, /ai-sources-panel/u);
  assert.match(ui, /مشاهده منبع/u);
  assert.match(ui, /noopener noreferrer/u);
  assert.match(ui, /ارسال پاسخ‌ها و ادامهٔ مشاوره/u);
  assert.match(ui, /پیام‌های متنی برای تولید پاسخ به جی‌پی‌تی/u);
  assert.match(ui, /متن درخواست و پیش‌نویس ممکن است/u);
  assert.match(ui, /پیوست‌ها برای تحلیل به جمینای فرستاده می‌شوند/u);
});
