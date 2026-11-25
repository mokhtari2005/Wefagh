import { json, readCookie, SESSION_COOKIE } from './http.js';
import { currentUser } from './auth/routes.js';
import { hashToken } from './auth/token.js';

const iso = () => new Date().toISOString();
const validSession = (value) => typeof value === 'string' && /^[a-f0-9-]{24,64}$/i.test(value);

// ثبت حضور فقط به شناسه و نام نمایشی نیاز دارد؛ currentUser اطلاعات و چند کوئری
// غیرضروری (عضویت، سمت و نقش‌ها) را برای هر heartbeat واکشی می‌کرد.
async function visitorIdentity(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(`SELECT u.id, u.display_name AS displayName, u.membership_status AS membershipStatus
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2
      AND u.status = 'active' AND u.email_verified_at IS NOT NULL
    LIMIT 1`).bind(await hashToken(token), iso()).first().then((row) => !row?.membershipStatus || row.membershipStatus === 'approved' ? row : null);
}

// پاک‌سازی دوره‌ای؛ این کار نباید در مسیر پرتکرار heartbeat اجرا شود.
// ستون last_seen از نوع ISO-8601 است و مقایسه مستقیم امکان استفاده از ایندکس را می‌دهد.
export async function cleanupStaleVisitors(env, now = Date.now()) {
  if (!env.DB) return;
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return env.DB.prepare('DELETE FROM site_visitors WHERE last_seen < ?1').bind(cutoff).run();
}

export async function handleVisitorAnalytics(request, env, path) {
  if (path === '/api/analytics/heartbeat') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }
    if (!validSession(body?.sessionId)) return json({ ok: false, error: 'INVALID_SESSION' }, 422);
    const pathValue = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.slice(0, 180) : '/';
    const user = await visitorIdentity(request, env).catch(() => null);
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
    return json({ ok: true });
  }

  if (path !== '/api/admin/analytics/overview') return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
  if (!user.roles?.some((role) => ['admin','super_admin','academy_manager'].includes(role))) return json({ ok: false, error: 'FORBIDDEN' }, 403);

  const now = new Date();
  const onlineCutoff = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const todayCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const weekCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [online, today, total, popular] = await Promise.all([
    env.DB.prepare('SELECT session_id,user_id,display_name,ip_address,user_agent,current_path,first_seen,last_seen,page_views FROM site_visitors WHERE last_seen >= ?1 ORDER BY last_seen DESC LIMIT 200').bind(onlineCutoff).all(),
    env.DB.prepare('SELECT COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors FROM site_visitors WHERE first_seen >= ?1').bind(todayCutoff).first(),
    env.DB.prepare('SELECT COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors FROM site_visitors WHERE first_seen >= ?1').bind(monthCutoff).first(),
    env.DB.prepare('SELECT current_path, SUM(page_views) AS views FROM site_visitors WHERE last_seen >= ?1 GROUP BY current_path ORDER BY views DESC LIMIT 10').bind(weekCutoff).all(),
  ]);
  return json({ ok: true, generatedAt: iso(), online: online.results || [], today: today || {}, last30Days: total || {}, popularPages: popular.results || [] });
}
