// هر فایل JavaScript در worker/src و site/js باید نحوی درست داشته باشد.
// این تست جلوی ثبت فایل ناقص (مثل routes.js که وسط تابع قطع شده بود) روی main را می‌گیرد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('همهٔ ماژول‌های worker/src و site/js نحو معتبر دارند', () => {
  const files = [...walk(join(root, 'worker', 'src')), ...walk(join(root, 'site', 'js'))];
  assert.ok(files.length > 50, 'فهرست فایل‌ها باید کامل باشد');
  const broken = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      broken.push(`${file.slice(root.length + 1)}: ${String(error.stderr || error.message).split('\n').find((l) => l.includes('Error') || l.includes('Unexpected')) || 'SyntaxError'}`);
    }
  }
  assert.deepEqual(broken, []);
});
