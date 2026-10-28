// مسیرهای رسانه: عمومی و فقط‌خواندنی.
import { json } from '../http.js';
import { ARTICLES, EPISODES, findArticle } from './catalog.js';

const SLUG_RE = /^[a-z0-9-]{1,100}$/;

export async function handleMedia(request, path) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  }
  if (path === '/api/media/articles') {
    return json({
      ok: true,
      articles: ARTICLES.map(({ slug, title, author, publishedAt, summary }) => ({ slug, title, author, publishedAt, summary })),
    });
  }
  const m = path.match(/^\/api\/media\/articles\/([a-z0-9-]{1,100})$/);
  if (m) {
    if (!SLUG_RE.test(m[1])) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    const a = findArticle(m[1]);
    if (!a) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    return json({ ok: true, article: a });
  }
  if (path === '/api/media/episodes') {
    return json({ ok: true, episodes: EPISODES });
  }
  return null;
}
