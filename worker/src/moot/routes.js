// مسیرهای بانک پرونده‌های موت‌کورت: فهرست، جزئیات، پیشنهاد چرخشی، انتخاب، تکمیل و سوابق کاربر.
// پرونده‌ها فقط منتشرشده‌ها را برمی‌گردانند؛ رأی آموزشی و پرسش‌های قاضی هرگز در پاسخ عمومی نیستند.
import { json } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { AREAS, DIFFICULTIES } from './caseSchema.js';
import { listPublishedCases, getPublishedCase, publicCase, SLUG_RE } from './caseStore.js';
import { suggestCases } from './suggest.js';

const MAX_SUGGEST = 10;

async function historyFor(env, userId) {
  const rows = await env.DB.prepare('SELECT case_slug, views, selections, completions, last_seen_at FROM moot_case_history WHERE user_id = ?1').bind(userId).all();
  return rows?.results || [];
}

async function recordEvent(env, userId, slug, kind) {
  const sql = kind === 'select'
    ? `INSERT INTO moot_case_history (user_id, case_slug, views, selections, completions, last_seen_at)
       VALUES (?1, ?2, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT (user_id, case_slug) DO UPDATE SET views = views + 1, selections = selections + 1, last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    : `INSERT INTO moot_case_history (user_id, case_slug, views, selections, completions, last_seen_at)
       VALUES (?1, ?2, 0, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT (user_id, case_slug) DO UPDATE SET completions = completions + 1, last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  await env.DB.prepare(sql).bind(userId, slug).run();
}

function parseFilters(url) {
  const area = url.searchParams.get('area');
  const difficulty = url.searchParams.get('difficulty');
  const q = url.searchParams.get('q');
  if (area && !AREAS.includes(area)) return { error: 'VALIDATION_FAILED' };
  if (difficulty && !DIFFICULTIES.includes(difficulty)) return { error: 'VALIDATION_FAILED' };
  if (q && q.length > 120) return { error: 'VALIDATION_FAILED' };
  return { area, difficulty, q };
}

/** @returns {Promise<Response|null>} null وقتی مسیر متعلق به این ماژول نیست. */
export async function handleMootBank(request, env, path) {
  const isList = path === '/api/moot/cases';
  const isSuggest = path === '/api/moot/cases/suggest';
  const isHistory = path === '/api/moot/history';
  const detail = path.match(/^\/api\/moot\/cases\/([a-z0-9-]{3,64})$/);
  const action = path.match(/^\/api\/moot\/cases\/([a-z0-9-]{3,64})\/(select|complete)$/);
  if (!isList && !isSuggest && !isHistory && !detail && !action) return null;

  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);

  if (isList || isSuggest) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const url = new URL(request.url);
    const filters = parseFilters(url);
    if (filters.error) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    const cases = await listPublishedCases(env, filters);
    if (isList) return json({ ok: true, cases, total: cases.length });
    const count = Math.min(MAX_SUGGEST, Math.max(1, Number(url.searchParams.get('count')) || 5));
    const user = await currentUser(request, env);
    const history = user ? await historyFor(env, user.id) : [];
    const suggestions = suggestCases(cases, history, { count });
    return json({ ok: true, cases: suggestions, personal: Boolean(user) });
  }

  if (detail) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const c = await getPublishedCase(env, detail[1]);
    return c ? json({ ok: true, case: publicCase(c) }) : json({ ok: false, error: 'NOT_FOUND' }, 404);
  }

  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  if (isHistory) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const rows = await env.DB.prepare(`SELECT h.case_slug, h.views, h.selections, h.completions, h.last_seen_at
      FROM moot_case_history h WHERE h.user_id = ?1 ORDER BY h.last_seen_at DESC LIMIT 200`).bind(user.id).all();
    return json({ ok: true, history: rows?.results || [] });
  }

  if (action) {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    const [, slug, kind] = action;
    if (!SLUG_RE.test(slug)) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    const c = await getPublishedCase(env, slug);
    if (!c) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    await recordEvent(env, user.id, slug, kind);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'NOT_FOUND' }, 404);
}
