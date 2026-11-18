import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../site/data/ekhtebar-questions.json', import.meta.url), 'utf8');
const bank = JSON.parse(raw);

test('Ekhtabar bank has unique IDs and required publication metadata', () => {
  assert.ok(Array.isArray(bank.records));
  assert.ok(bank.records.length >= 70);
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

test('Expanded archive includes individually indexed Gilan and Qazvin questions', () => {
  const ids = new Set(bank.records.map((item) => item.id));
  for (const id of [
    'GILAN-CIV-1404-002',
    'GILAN-COM-1404-002',
    'GILAN-CIVPRO-1404-002',
    'GILAN-CIVPRO-1404-003',
    'GILAN-REG-1404-002',
    'GILAN-PROB-1404-001',
    'GILAN-CRIMPRO-1404-002',
    'GILAN-CRIM-1404-002',
    'GILAN-CIVPRO-1400-002',
    'GILAN-CIV-1400-002',
    'GILAN-REG-1400-002',
    'QAZVIN-CIV-1384-002',
    'QAZVIN-REG-1384-002',
    'QAZVIN-CRIM-1384-003',
    'QAZVIN-CIVPRO-1384-002',
    'QAZVIN-CRIMPRO-1384-002'
  ]) assert.ok(ids.has(id), 'missing expanded record: ' + id);
});
