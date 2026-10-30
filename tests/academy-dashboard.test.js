import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { ACADEMY_TOOLS } from '../site/js/academy.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, '..', 'site', 'js', 'app.js'), 'utf8');

test('هر کارت آکادمی به یک مسیر ثبت‌شدهٔ واقعی در app.js اشاره می‌کند', () => {
  for (const item of ACADEMY_TOOLS) {
    assert.match(item.href, /^#\//, `${item.title} باید مسیر hash داشته باشد`);
    const path = item.href.slice(1).split('?')[0];
    assert.ok(app.includes(`'${path}':`), `مسیر ${path} در جدول مسیرها نیست`);
  }
});

test('کارت‌ها عنوان و آیکون یکتا دارند و تکراری نیستند', () => {
  const hrefs = ACADEMY_TOOLS.map((i) => i.href);
  const titles = ACADEMY_TOOLS.map((i) => i.title);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(new Set(titles).size, titles.length);
  for (const item of ACADEMY_TOOLS) assert.ok(item.icon && item.title);
});

test('برچسب موت‌کورت صوتی که هنوز پیاده نشده حذف شده است', () => {
  assert.ok(!ACADEMY_TOOLS.some((i) => i.title.includes('صوتی')));
});
