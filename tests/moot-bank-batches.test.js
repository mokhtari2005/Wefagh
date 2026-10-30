// آزمون بانک پرونده‌ها: همهٔ دسته‌ها معتبر، شناسه و موضوع تکراری ندارند، و حداقل ۲۰۰ پرونده وجود دارد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateCase, AREAS } from '../worker/src/moot/caseSchema.js';

const here = dirname(fileURLToPath(import.meta.url));
const bankDir = join(here, '..', 'worker', 'src', 'moot', 'bank');
const files = readdirSync(bankDir).filter((f) => /^batch-\d+\.js$/.test(f)).sort();

const cases = [];
for (const f of files) {
  const mod = await import(pathToFileURL(join(bankDir, f)).href);
  cases.push(...mod.default);
}

test('bank has at least 200 cases', () => {
  assert.ok(cases.length >= 200, `only ${cases.length} cases`);
});

test('every bank case validates as draft', () => {
  const bad = [];
  for (const c of cases) {
    const r = validateCase(c, { status: 'draft' });
    if (!r.ok) bad.push(`${c.id}: ${r.errors.join(' | ')}`);
  }
  assert.deepEqual(bad, []);
});

test('ids and subject/claim pairs are unique', () => {
  const ids = new Set();
  const keys = new Set();
  const dup = [];
  for (const c of cases) {
    if (ids.has(c.id)) dup.push(`id ${c.id}`);
    ids.add(c.id);
    const key = `${c.subject}|${c.request?.claim}`;
    if (keys.has(key)) dup.push(`scenario ${c.id}`);
    keys.add(key);
  }
  assert.deepEqual(dup, []);
});

test('every area has at least one case', () => {
  const counts = new Map(AREAS.map((a) => [a, 0]));
  for (const c of cases) if (counts.has(c.area)) counts.set(c.area, counts.get(c.area) + 1);
  const empty = [...counts].filter(([, n]) => n === 0).map(([a]) => a);
  assert.deepEqual(empty, []);
});
