// رسانهٔ عمومی: محتوای پایهٔ داخل کد و محتوای تأییدشدهٔ مدیران.
import { json } from '../http.js';
import { ARTICLES, EPISODES, findArticle } from './catalog.js';

const SLUG_RE = /^[a-z0-9-]{1,100}$/;
async function managed(env, kind, slug = null) {
  if (!env?.DB) return [];
  try {
    const sql = slug
      ? "SELECT slug,title,summary,payload_json FROM admin_media WHERE kind=?1 AND status='published' AND slug=?2 LIMIT 1"
      : "SELECT slug,title,summary,payload_json FROM admin_media WHERE kind=?1 AND status='published' ORDER BY title LIMIT 200";
    const result = slug ? await env.DB.prepare(sql).bind(kind, slug).first() : await env.DB.prepare(sql).bind(kind).all();
    const rows = slug ? (result ? [result] : []) : (result?.results || []);
    return rows.flatMap((row) => { try { const p = JSON.parse(row.payload_json); return [{ slug: row.slug, id: row.slug, title: row.title, summary: row.summary, ...p }]; } catch { return []; } });
  } catch { return []; }
}
export async function handleMedia(request, env, path) {
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  if (path === '/api/media/articles') {
    const items = await managed(env, 'article');
    const articles = [...ARTICLES.map(({ slug, title, author, publishedAt, summary }) => ({ slug, title, author, publishedAt, summary })), ...items.map(({ slug, title, author, publishedAt, summary }) => ({ slug, title, author, publishedAt, summary }))];
    const unique = [...new Map(articles.map((a) => [a.slug, a])).values()];
    return json({ ok: true, articles: unique });
  }
  const m = path.match(/^\/api\/media\/articles\/([a-z0-9-]{1,100})$/);
  if (m) {
    if (!SLUG_RE.test(m[1])) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    const dynamic = (await managed(env, 'article', m[1]))[0];
    if (dynamic) return json({ ok: true, article: dynamic });
    const a = findArticle(m[1]);
    return a ? json({ ok: true, article: a }) : json({ ok: false, error: 'NOT_FOUND' }, 404);
  }
  if (path === '/api/media/episodes') {
    const items = await managed(env, 'episode');
    const episodes = [...EPISODES, ...items.map((ep) => ({ id: ep.slug, title: ep.title, description: ep.description, publishedAt: ep.publishedAt, durationMinutes: ep.durationMinutes ?? null, audioUrl: ep.audioUrl ?? null }))];
    return json({ ok: true, episodes: [...new Map(episodes.map((e) => [e.id, e])).values()] });
  }
  return null;
}
