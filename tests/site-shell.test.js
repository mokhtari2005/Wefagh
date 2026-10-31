// آزمون ساختار پوستهٔ مشترک سایت: لوگو، ناوبری پایین، پیوند پرش و نبود style inline (با CSP سازگار).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', 'site');
const html = readFileSync(join(site, 'index.html'), 'utf8');

test('سربرگ بدون لوگو است و نام آکادمی به فارسی و انگلیسی در آن نمایش داده می‌شود', () => {
  const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
  assert.doesNotMatch(header, /<img/);
  assert.match(header, /class="brand-text"><strong>آکادمی وکالت شهرام مختاری<\/strong>/);
  assert.match(header, /Shahram Mokhtari Law Academy/);
});

test('فوتر لوگو ندارد و انتخاب پوسته رنگی را دارد', () => {
  const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
  assert.doesNotMatch(footer, /<img/);
  assert.match(footer, /class="theme-picker"/);
  for (const name of ['green', 'navy', 'pencil']) {
    assert.match(footer, new RegExp('data-theme-choice="' + name + '"'));
  }
});

test('اسکریپت پوسته پیش از رندر در head بارگذاری می‌شود و فونت محلی موجود است', () => {
  const head = html.match(/<head>[\s\S]*?<\/head>/)[0];
  assert.match(head, /<script src="js\/theme\.js"><\/script>/);
  for (const f of ['Regular', 'SemiBold', 'Bold']) {
    assert.ok(existsSync(join(site, 'assets', 'fonts', 'Vazirmatn-UI-FD-' + f + '.woff2')));
  }
  assert.ok(existsSync(join(site, 'assets', 'fonts', 'OFL.txt')));
});

test('نوار ناوبری پایین پنج پیوند دارد و دکمهٔ خانه در میانه است', () => {
  const nav = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'bottom-nav یافت نشد');
  assert.equal((nav[0].match(/<a |<button /g) || []).length, 5);
  assert.match(nav[0], /class="bottom-home"/);
});

test('پیوند پرش به محتوا و عنصر main وجود دارد', () => {
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /<main id="main"/);
});

test('HTML اصلی بدون style attribute است (سازگار با CSP)', () => {
  assert.doesNotMatch(html, /\sstyle=/);
});

test('فایل‌های CSS و JS اصلی در HTML بارگذاری می‌شوند', () => {
  assert.match(html, /href="css\/styles\.css"/);
  assert.match(html, /src="js\/app\.js"/);
});
