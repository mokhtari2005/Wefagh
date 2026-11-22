import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packStoredAiMessage, unpackStoredAiMessage } from '../site/js/assistant.js';

test('پیشنهاد جست‌وجوی Google در تاریخچه ذخیره و هنگام بازیابی جدا می‌شود', () => {
  const answer = 'پاسخ حقوقی مستند';
  const html = '<div class="google-search-chip">Search</div>';
  const packed = packStoredAiMessage(answer, html);
  assert.notEqual(packed, answer);
  assert.deepEqual(unpackStoredAiMessage(packed), { text: answer, searchSuggestionHtml: html, searchSources: [] });
});

test('پیام‌های قدیمی بدون پیشنهاد جست‌وجو بدون تغییر بازیابی می‌شوند', () => {
  assert.deepEqual(unpackStoredAiMessage('پاسخ قدیمی'), { text: 'پاسخ قدیمی', searchSuggestionHtml: '', searchSources: [] });
});

test('پیوندهای منبع همراه با عبارت مرتبط در پاسخ در تاریخچه حفظ می‌شوند', () => {
  const sources = [{ title: 'قانون', uri: 'https://qavanin.ir/law/1', domain: 'qavanin.ir', supportedClaim: 'ماده ۵۶' }];
  const packed = packStoredAiMessage('پاسخ', '', sources);
  assert.deepEqual(unpackStoredAiMessage(packed), { text: 'پاسخ', searchSuggestionHtml: '', searchSources: sources });
});

test('پیوندهای ذخیره‌شده با قالب قدیمی citedText نیز بدون از دست رفتن متن بازیابی می‌شوند', () => {
  const legacy = JSON.stringify({ sources: [{ title: 'قانون', uri: 'https://qavanin.ir/law/1', domain: 'qavanin.ir', citedText: 'ماده ۵۶' }] });
  const packed = 'پاسخ' + '\n<!--GOOGLE_SEARCH_SUGGESTION:' + encodeURIComponent(legacy) + '-->';
  assert.deepEqual(unpackStoredAiMessage(packed), {
    text: 'پاسخ',
    searchSuggestionHtml: '',
    searchSources: [{ title: 'قانون', uri: 'https://qavanin.ir/law/1', domain: 'qavanin.ir', supportedClaim: 'ماده ۵۶' }],
  });
});

test('پیشنهاد بیش از اندازه در تاریخچه ذخیره نمی‌شود', () => {
  const answer = 'پاسخ';
  assert.equal(packStoredAiMessage(answer, 'x'.repeat(5001)), answer);
});
