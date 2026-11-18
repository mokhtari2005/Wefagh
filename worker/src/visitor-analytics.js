import { json } from './http.js';
import { currentUser } from './auth/routes.js';

const iso = () => new Date().toISOString();
const validSession = (value) => typeof value === 'string' && /^[a-f0-9-]{24,64}$/i.test(value);

export async function handleVisitorAnalytics(request, env, path) {
  if (path === '/api/analytics/heartbeat') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }
    if (!validSession(body?.sessionId)) return json({ ok: false, error: 'INVALID_SESSION' }, 422);
    const pathValue = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.slice(0, 180) : '/';
    const user = await currentUser(request, env).catch(() => null);
    const now = iso();
    // CF-Connecting-IP توسط Cloudflare در لبه تنظیم می‌شود؛ X-Forwarded-For عمداً مبنا قرار نمی‌گیرد.
    const ip = request.headers.get('CF-Connecting-IP') || null;
    const ua = (request.headers.get('User-Agent') || '').slice(0, 300) || null;
    await env.DB.prepare(`INSERT INTO site_visitors
      (session_id,user_id,display_name,ip_address,user_agent,current_path,first_seen,last_seen,page_views)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?7,1)
      ON CONFLICT(session_id) DO UPDATE SET
      user_id=excluded.user_id, display_name=excluded.display_name,
      ip_address=excluded.ip_address, user_agent=excluded.user_agent,
      page_views=site_visitors.page_views + CASE WHEN site_visitors.current_path <> excluded.current_path THEN 1 ELSE 0 END,
      current_path=excluded.current_path,last_seen=excluded.last_seen`)
      .bind(body.sessionId, user?.id || null, user?.displayName || null, ip, ua, pathValue, now).run();
    // دادهٔ خام بازدیدکننده بیش از ۳۰ روز نگهداری نمی‌شود.
    await env.DB.prepare("DELETE FROM site_visitors WHERE datetime(last_seen) < datetime('now','-30 days')").run().catch(() => {});
    return json({ ok: true });
  }

  if (path !== '/api/admin/analytics/overview') return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
  if (!user.roles?.some((role) => ['admin','super_admin','academy_manager'].includes(role))) return json({ ok: false, error: 'FORBIDDEN' }, 403);

  const [online, today, total, popular] = await Promise.all([
    env.DB.prepare("SELECT session_id,user_id,display_name,ip_address,user_agent,current_path,first_seen,last_seen,page_views FROM site_visitors WHERE datetime(last_seen) >= datetime('now','-2 minutes') ORDER BY last_seen DESC LIMIT 200").all(),
    env.DB.prepare("SELECT COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors FROM site_visitors WHERE first_seen >= date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors FROM site_visitors WHERE first_seen >= datetime('now','-30 days')").first(),
    env.DB.prepare("SELECT current_path, SUM(page_views) AS views FROM site_visitors WHERE datetime(last_seen) >= datetime('now','-7 days') GROUP BY current_path ORDER BY views DESC LIMIT 10").all(),
  ]);
  return json({ ok: true, generatedAt: iso(), online: online.results || [], today: today || {}, last30Days: total || {}, popularPages: popular.results || [] });
}
