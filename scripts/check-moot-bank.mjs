// بررسی کیفیت بانک پرونده‌ها: اعتبارسنجی ساختار، تکراری نبودن شناسه و موضوع، پوشش حوزه‌ها و سطوح.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { validateCase, AREAS, DIFFICULTIES } from '../worker/src/moot/caseSchema.js';

const here = dirname(fileURLToPath(import.meta.url));
const bankDir = join(here, '..', 'worker', 'src', 'moot', 'bank');
const files = readdirSync(bankDir).filter((f) => /^batch-\d+\.js$/.test(f)).sort();

const cases = [];
for (const f of files) {
  const mod = await import(pathToFileURL(join(bankDir, f)).href);
  cases.push(...mod.default);
}

const problems = [];
const ids = new Map();
const scenarioKeys = new Map();
for (const c of cases) {
  const r = validateCase(c, { status: 'draft' });
  if (!r.ok) problems.push(`${c.id || '?'}: ${r.errors.join(' | ')}`);
  ids.set(c.id, (ids.get(c.id) || 0) + 1);
  // کلید سناریو: موضوع دعوا + خواسته؛ تشابه بالا نشانهٔ تغییر نام اشخاص و ارقام است.
  const key = `${c.subject}|${c.request?.claim}`;
  scenarioKeys.set(key, [...(scenarioKeys.get(key) || []), c.id]);
}
for (const [id, n] of ids) if (n > 1) problems.push(`شناسهٔ تکراری: ${id} (${n} بار)`);
for (const [key, list] of scenarioKeys) if (list.length > 1) problems.push(`موضوع تکراری: ${list.join(', ')}`);

const byArea = Object.fromEntries(AREAS.map((a) => [a, 0]));
const byDiff = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
let refs = { verified: 0, needs_review: 0, corrected: 0 };
for (const c of cases) {
  if (c.area in byArea) byArea[c.area] += 1;
  if (c.difficulty in byDiff) byDiff[c.difficulty] += 1;
  for (const r of c.legal_refs || []) refs[r.status] = (refs[r.status] || 0) + 1;
}

const report = {
  files,
  total: cases.length,
  valid: cases.length - problems.filter((p) => !p.startsWith('شناسهٔ') && !p.startsWith('موضوع')).length,
  byArea,
  byDiff,
  refs,
  problems,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = problems.length ? 1 : 0;
