import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsFeed } from './news.js';

const source = { name: 'ایسنا', host: 'www.isna.ir' };
const now = Date.parse('2026-11-17T00:00:00Z');

test('فقط خبر تازه و مرتبط از دامنه منبع مجاز در RSS استخراج می‌شود', () => {
  const xml = `<rss><channel>
    <item><title>تصویب لایحه جدید در کمیسیون قضایی مجلس</title><link>https://www.isna.ir/news/123</link><description>جزئیات بررسی لایحه در مجلس</description><pubDate>Mon, 16 Nov 2026 20:00:00 GMT</pubDate></item>
    <item><title>نتیجه مسابقه فوتبال</title><link>https://www.isna.ir/news/124</link><description>گزارش ورزشی</description><pubDate>Mon, 16 Nov 2026 20:00:00 GMT</pubDate></item>
    <item><title>خبر حقوقی خارج از دامنه</title><link>https://example.com/news/125</link><description>دادگاه</description><pubDate>Mon, 16 Nov 2026 20:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const items = parseNewsFeed(xml, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].category, 'مجلس و امور تقنینی');
  assert.equal(items[0].source, 'ایسنا');
});

test('خبر تازه و مرتبط در قالب Atom نیز استخراج می‌شود', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>ابلاغ آیین‌نامه جدید در قوه قضاییه</title>
      <link rel="alternate" type="text/html" href="https://www.isna.ir/news/126" />
      <summary>جزئیات مقررات و دادگستری</summary>
      <updated>2026-11-16T22:00:00Z</updated>
    </entry>
  </feed>`;
  const items = parseNewsFeed(xml, source, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://www.isna.ir/news/126');
  assert.equal(items[0].category, 'قوانین و مقررات');
});

test('خبر قدیمی یا بدون تاریخ منتشر نمی‌شود', () => {
  const xml = `<rss><item><title>خبر دادگستری</title><link>https://www.isna.ir/news/1</link><description>دادگاه</description><pubDate>Mon, 10 Nov 2026 20:00:00 GMT</pubDate></item></rss>`;
  assert.equal(parseNewsFeed(xml, source, now).length, 0);
});
