import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsFeed } from './news.js';

const source = { name: 'ایسنا', host: 'www.isna.ir' };
const now = Date.parse('2026-11-17T00:00:00Z');

test('فقط خبر تازه و مرتبط از دامنه منبع مجاز استخراج می‌شود', () => {
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

test('خبر قدیمی یا بدون تاریخ منتشر نمی‌شود', () => {
  const xml = `<rss><item><title>خبر دادگستری</title><link>https://www.isna.ir/news/1</link><description>دادگاه</description><pubDate>Mon, 10 Nov 2026 20:00:00 GMT</pubDate></item></rss>`;
  assert.equal(parseNewsFeed(xml, source, now).length, 0);
});
