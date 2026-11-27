import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAssistantFooterBoilerplate, summarizeReply } from '../site/js/assistant.js';

test('assistant removes the two repetitive legal footer sentences from displayed and copied text', () => {
  const input = [
    'تحلیل اصلی پرونده.',
    'شرط مطالبه چک ضمانت اثبات تخلف از تعهد پایه است.',
    'تا زمان ایجاد حق مطالبه، اقدام حقوقی نتیجه‌بخش نخواهد بود.',
    'راهکار حقوقی متناسب با اسناد پرونده.',
  ].join('\n\n');
  assert.equal(stripAssistantFooterBoilerplate(input), 'تحلیل اصلی پرونده.\n\nراهکار حقوقی متناسب با اسناد پرونده.');
  assert.equal(summarizeReply({ text: input }, 'consult'), 'تحلیل اصلی پرونده.\n\nراهکار حقوقی متناسب با اسناد پرونده.');
});

test('assistant footer cleanup preserves unrelated substantive text', () => {
  const input = 'با توجه به قرارداد و تاریخ سررسید، ابتدا باید تخلف از تعهد احراز شود.';
  assert.equal(stripAssistantFooterBoilerplate(input), input);
});

test('assistant footer cleanup handles non-string values safely', () => {
  assert.equal(stripAssistantFooterBoilerplate(null), '');
  assert.equal(stripAssistantFooterBoilerplate({ text: 'پاسخ' }), '');
});
