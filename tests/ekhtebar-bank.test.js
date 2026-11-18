import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../site/data/ekhtebar-questions.json', import.meta.url), 'utf8');
const bank = JSON.parse(raw);

test('Ekhtabar bank has unique IDs and required publication metadata', () => {
  assert.ok(Array.isArray(bank.records));
  assert.ok(bank.records.length >= 12);
  const ids = bank.records.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of bank.records) {
    assert.ok(item.category);
    assert.ok(item.sub_category);
    assert.ok(item.question_title);
    assert.ok(item.question_text.length > 100);
    assert.ok(item.source_bar);
    assert.ok(item.source_url.startsWith('https://'));
    assert.ok(Array.isArray(item.tags) && item.tags.length > 0);
  }
});

test('Ekhtabar bank covers all six core subjects', () => {
  const categories = new Set(bank.records.map((item) => item.category));
  for (const subject of ['حقوق مدنی','آیین دادرسی مدنی','حقوق کیفری','آیین دادرسی کیفری','حقوق تجارت','حقوق ثبت']) {
    assert.ok(categories.has(subject), 'missing category: ' + subject);
  }
});

test('Archive source list is present', () => {
  assert.ok(Array.isArray(bank.archives));
  assert.ok(bank.archives.length >= 5);
});
