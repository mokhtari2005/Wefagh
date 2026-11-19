// Regression test for calculator PDF visibility in print mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'site', 'css', 'styles.css'), 'utf8');
const report = readFileSync(join(here, '..', 'site', 'js', 'calc', 'report.js'), 'utf8');

test('calculator PDF sheet and its contents are explicitly visible in print mode', () => {
  const printRules = [...css.matchAll(/@media\\s+print\\s*\\{[\\s\\S]*?\\n\\}/g)].map((m) => m[0]);
  assert.ok(
    printRules.some((rule) => /body\\.academy-pdf-body\\s+\\.academy-pdf-sheet\\s*,[\\s\\S]*?visibility:\\s*visible\\s*!important/.test(rule)),
    'the calculator PDF sheet must override global print rules that hide body descendants'
  );
});

test('calculator report renderer targets the academy PDF sheet', () => {
  assert.match(report, /querySelector\\('\.academy-pdf-sheet'\\)/);
  assert.match(report, /html2pdf\\(\\)\\.set/);
});
