import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routes = await readFile(new URL('../worker/src/ai/routes.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../site/js/ekhtebar.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../site/css/ekhtebar.css', import.meta.url), 'utf8');

test('Ekhtabar detailed-answer API is registered and protected by shared AI authorization', () => {
  assert.match(routes, /async function ekhtebarAnswer\(request, env\)/);
  assert.match(routes, /if \(path === '\/api\/ai\/ekhtebar\/answer'\) return ekhtebarAnswer\(request, env\)/);
  assert.match(routes, /findVerifiedLegalArticles\(env\.DB, `\$\{category\} \$\{title\} \$\{question\}`\)/);
  assert.match(routes, /legalSources/);
  assert.match(routes, /LEGAL_DISCLAIMER/);
});

test('Every Ekhtabar question exposes a detailed answer action with legal source display', () => {
  assert.match(page, /دریافت پاسخ تشریحی و مستند/);
  assert.match(page, /\/api\/ai\/ekhtebar\/answer/);
  assert.match(page, /مواد بازیابی‌شده از بانک قوانین آکادمی/);
  assert.match(page, /مثبت/);
  assert.match(css, /\.ekhtebar-answer-content/);
  assert.match(css, /@media\(max-width:560px\)/);
});
