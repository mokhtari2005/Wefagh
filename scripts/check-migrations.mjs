// بررسی ایمنی مهاجرت‌های D1 پیش از Merge: شماره‌گذاری پیوسته و بدون تکرار، نام استاندارد، بدون محتوای خالی.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const problems = [];
files.forEach((f, i) => {
  const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(f);
  if (!m) problems.push(`نام نامعتبر: ${f}`);
  else if (Number(m[1]) !== i + 1) problems.push(`شماره‌گذاری ناپیوسته یا تکراری در ${f} (انتظار ${String(i + 1).padStart(4, '0')})`);
  if (!readFileSync(join(dir, f), 'utf8').trim()) problems.push(`فایل خالی: ${f}`);
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`مهاجرت‌ها سالم‌اند (${files.length} فایل).`);
