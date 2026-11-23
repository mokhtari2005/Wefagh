import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../site/js/assistant.js', import.meta.url), 'utf8');

test('مشاوره هوشمند مستقیماً با محیط یکپارچه متنی و صوتی باز می‌شود', () => {
  assert.match(source, /if \(initialMode === 'consult'\) openWorkspace\('smart'\)/u);
  assert.match(source, /else body\.replaceChildren\(methodChooser\(openWorkspace, chooserTitle\)\)/u);
});

test('پس از دریافت پاسخ، کادر گفت‌وگو و آخرین پیام در محدوده دید قرار می‌گیرند', () => {
  assert.match(source, /stream\.scrollIntoView\(\{ behavior: 'smooth', block: 'center'/u);
  assert.match(source, /stream\.scrollTo\(\{ top: stream\.scrollHeight, behavior: 'smooth' \}\)/u);
  assert.doesNotMatch(source, /log\.lastElementChild\?\.scrollIntoView/u);
});
