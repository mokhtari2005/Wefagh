// گردآوری روزانه خبرهای مرتبط با وکالت از RSS منابع داخلیِ از پیش تأییدشده.
const SOURCES = [
  { name: 'ایسنا', host: 'www.isna.ir', url: 'https://www.isna.ir/rss' },
  { name: 'خبرگزاری مهر', host: 'www.mehrnews.com', url: 'https://www.mehrnews.com/rss' },
  { name: 'خبرگزاری تسنیم', host: 'www.tasnimnews.com', url: 'https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D9%85%D9%87%D9%85%D8%AA%D8%B1%DB%8C%D9%86-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%AA%D8%B3%D9%86%DB%8C%D9%85' },
  { name: 'باشگاه خبرنگاران جوان', host: 'www.yjc.ir', url: 'https://www.yjc.ir/fa/rss/allnews' },
  { name: 'خبرآنلاین', host: 'www.khabaronline.ir', url: 'https://www.khabaronline.ir/rss' },
  { name: 'عصر ایران', host: 'www.asriran.com', url: 'https://www.asriran.com/fa/rss/allnews' },
  { name: 'تابناک', host: 'www.tabnak.ir', url: 'https://www.tabnak.ir/fa/rss/allnews' },
];

const TOPICS = [
  { category: 'وکالت و نهاد وکالت', terms: ['وکالت', 'وکیل', 'کانون وکلا', 'اسکودا', 'کارآموز وکالت', 'آزمون وکالت', 'مرکز وکلا'] },
  { category: 'قوانین و مقررات', terms: ['قانون', 'لایحه', 'آیین نامه', 'آیین‌نامه', 'تصویب نامه', 'مصوبه', 'مقررات'] },
  { category: 'قضایی و دادگستری', terms: ['قوه قضاییه', 'قضایی', 'دادگستری', 'دادگاه', 'دیوان عالی', 'دیوان عدالت', 'دادستان', 'رئیس قوه', 'قضاوت', '司法'] },
  { category: 'مجلس و امور تقنینی', terms: ['مجلس', 'نماینده مجلس', 'کمیسیون قضایی', 'کمیسیون حقوقی', 'طرح', 'نمایندگان'] },
  { category: 'حقوق شهروندی و کسب‌وکار', terms: ['حقوق شهروندی', 'حقوقی', 'حقوق کار', 'تجارت', 'ثبت اسناد', 'ثبت احوال', 'مالیات', 'تامین اجتماعی', 'تأمین اجتماعی'] },
];

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}
function tag(item, name) {
  const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '\\s*>', 'i');
  return decodeXml(item.match(re)?.[1] || '');
}
function classify(text) {
  const normalized = text.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
  for (const topic of TOPICS) if (topic.terms.some((term) => normalized.includes(term.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')))) return topic.category;
  return null;
}
function itemUrl(item) {
  const raw = tag(item, 'link') || item.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] || '';
  try { const u = new URL(raw); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
export function parseNewsFeed(xml, source, now = Date.now()) {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];
  const cutoff = now - 36 * 60 * 60 * 1000;
  return items.map((item) => {
    const title = tag(item, 'title');
    const url = itemUrl(item);
    const dateText = tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated');
    const published = Date.parse(dateText);
    const summary = tag(item, 'description') || tag(item, 'summary') || title;
    const category = classify(title + ' ' + summary);
    if (!title || !url || !category || !Number.isFinite(published) || published < cutoff || published > now + 60 * 60 * 1000) return null;
    try { if (new URL(url).hostname !== source.host) return null; } catch { return null; }
    return { title: title.slice(0, 300), summary: summary.slice(0, 480), url, category, publishedAt: new Date(published).toISOString(), source: source.name };
  }).filter(Boolean);
}
export async function collectLegalNews(env, now = Date.now()) {
  if (!env?.DB) throw new Error('DB_NOT_CONFIGURED');
  const results = await Promise.allSettled(SOURCES.map(async (source) => {
    const response = await fetch(source.url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('FEED_HTTP_' + response.status);
    return parseNewsFeed(await response.text(), source, now);
  }));
  let inserted = 0;
  const statements = [];
  for (const result of results) if (result.status === 'fulfilled') {
    for (const item of result.value) statements.push(env.DB.prepare(
      'INSERT OR IGNORE INTO media_news (title,summary,source,source_url,category,published_at) VALUES (?1,?2,?3,?4,?5,?6)'
    ).bind(item.title, item.summary, item.source, item.url, item.category, item.publishedAt));
  }
  for (let i = 0; i < statements.length; i += 50) {
    const batch = await env.DB.batch(statements.slice(i, i + 50));
    inserted += batch.filter((r) => (r.meta?.changes || 0) > 0).length;
  }
  console.log(JSON.stringify({ where: 'media.news.cron', feeds: results.filter((r) => r.status === 'fulfilled').length, failedFeeds: results.filter((r) => r.status === 'rejected').length, candidates: statements.length, inserted }));
  return { inserted, feeds: results.filter((r) => r.status === 'fulfilled').length };
}
export async function listLegalNews(env) {
  if (!env?.DB) return [];
  const rows = await env.DB.prepare('SELECT id,title,summary,source,source_url AS url,category,published_at AS publishedAt FROM media_news ORDER BY published_at DESC LIMIT 100').all();
  return rows?.results || [];
}
