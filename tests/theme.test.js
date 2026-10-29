// آزمون پوسته‌های رنگی: سه پوسته تعریف شده‌اند، CSS متناظر دارند و اسکریپت بدون inline است.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', 'site');
const css = readFileSync(join(site, 'css', 'styles.css'), 'utf8');
const js = readFileSync(join(site, 'js', 'theme.js'), 'utf8');

test('هر سه پوسته در js و css تعریف شده‌اند', () => {
  for (const name of ['navy', 'pencil']) {
    assert.match(css, new RegExp(':root\\[data-theme="' + name + '"\\]'));
  }
  for (const name of ['green', 'navy', 'pencil']) {
    assert.match(js, new RegExp(name + ':'));
  }
});

test('پوسته‌ها همان متغیرهای رنگی پایه را بازنویسی می‌کنند', () => {
  for (const name of ['navy', 'pencil']) {
    const block = css.match(new RegExp(':root\\[data-theme="' + name + '"\\] \\{([\\s\\S]*?)\\}'))[1];
    for (const v of ['--cream', '--paper', '--ink', '--teal', '--gold']) {
      assert.match(block, new RegExp(v + ':'));
    }
  }
});

test('اسکریپت پوسته از localStorage با try/catch استفاده می‌کند و inline style ندارد', () => {
  assert.match(js, /try \{[\s\S]*localStorage/);
  assert.doesNotMatch(js, /style\s*=/);
  assert.doesNotMatch(js, /innerHTML/);
});

test('فونت Vazirmatn با font-display و مسیر نسبی بارگذاری می‌شود', () => {
  assert.match(css, /font-family: "Vazirmatn"/);
  assert.match(css, /url\("\.\.\/assets\/fonts\/Vazirmatn-UI-FD-Regular\.woff2"\)/);
  assert.match(css, /font-display: swap/);
});
