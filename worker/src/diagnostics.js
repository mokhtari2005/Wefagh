// ثبت امن خطاهای عملیاتی و نمایش آن‌ها فقط برای مدیر مجاز.
import { json, readJsonBody } from './http.js';
import { requireAdmin } from './admin.js';

const CATEGORIES = new Set(['api', 'network', 'javascript', 'promise']);
const COMPONENTS = new Set(['site', 'auth', 'academy', 'assistant', 'calculator', 'regional-map', 'voice-typing', 'calendar', 'cases', 'media', 'unknown']);
const ROUTE_RE = /^\/[a-zA-Z0-9/_.-]{0,100}$/;
const CODE_RE = /^[A-Z0-9_:-]{1,48}$/;

function cleanRoute(value) {
  const route = typeof value === 'string' ? value.split('?')[0].split('#')[0] : '/';
  return ROUTE_RE.test(route) ? route : '/';
}
function cleanCode(value) {
  const code = typeof value === 'string' ? value.toUpperCase() : 'UNKNOWN';
  return CODE_RE.test(code) ? code : 'UNKNOWN';
}
async function fingerprint(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** پیام خطا را برای ثبت عیب‌یابی پاک‌سازی می‌کند: بدون ایمیل، توکن یا رشتهٔ بلند و حداکثر ۱۶۰ نویسه. */
export function sanitizeFaultMessage(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** ثبت بهترین‌تلاش خطای ۵۰۰ سمت سرور؛ هیچ‌گاه خودش خطا برنمی‌گرداند. */
export async function recordServerFault(env, { route, error }) {
  try {
    if (!env?.DB) return;
    const safeRoute = cleanRoute(route);
    const code = cleanCode(error?.name ? `FAULT_${error.name}` : 'FAULT_ERROR');
    const detail = sanitizeFaultMessage(error?.message);
    const key = await fingerprint(['server-fault', safeRoute, code, detail].join('|'));
    await env.DB.prepare(`INSERT INTO diagnostic_events (fingerprint, category, component, route, error_code, http_status, detail)
      VALUES (?1, 'api', 'auth', ?2, ?3, 500, ?4)
      ON CONFLICT(fingerprint) DO UPDATE SET
        occurrences = MIN(diagnostic_events.occurrences + 1, 1000000),
        last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        status = CASE WHEN diagnostic_events.status = 'resolved' THEN 'open' ELSE diagnostic_events.status END,
        resolved_at = NULL`)
      .bind(key, safeRoute, code, detail).run();
  } catch {
    // ثبت عیب‌یابی نباید پاسخ اصلی را تغییر دهد.
  }
}

export async function handleDiagnostics(request, env, path) {
  if (path === '/api/admin/diagnostics/manual-report') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body || {};
    const component = COMPONENTS.has(body.component) ? body.component : null;
    const description = typeof body.description === 'string'
      ? body.description.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
      : '';
    const route = cleanRoute(body.route);
    if (!component || description.length < 10) return json({ ok: false, error: 'VALIDATION_FAILED', hint: 'بخش مشکل را انتخاب کنید و توضیحی دست‌کم ۱۰ نویسه‌ای بنویسید.' }, 422);
    const key = await fingerprint(['manual', component, route, description].join('|'));
    try {
      await env.DB.prepare(`INSERT INTO diagnostic_events (fingerprint, category, component, route, error_code, detail)
        VALUES (?1, 'manual', ?2, ?3, 'MANUAL_REPORT', ?4)
        ON CONFLICT(fingerprint) DO UPDATE SET
          occurrences = MIN(diagnostic_events.occurrences + 1, 1000000),
          last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          status = 'open', resolved_at = NULL`)
        .bind(key, component, route, description).run();
      return json({ ok: true, accepted: true, fingerprint: key }, 202);
    } catch (error) {
      console.error(JSON.stringify({ where: 'diagnostics.manual-report', error: error?.name || 'Error' }));
      return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
    }
  }
  if (path === '/api/diagnostics/report') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    if (!env.DB) return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body || {};
    const category = CATEGORIES.has(body.category) ? body.category : null;
    const component = COMPONENTS.has(body.component) ? body.component : 'unknown';
    const route = cleanRoute(body.route);
    const errorCode = cleanCode(body.errorCode);
    const httpStatus = Number.isInteger(body.httpStatus) && body.httpStatus >= 400 && body.httpStatus <= 599 ? body.httpStatus : null;
    if (!category) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    const key = await fingerprint([category, component, route, errorCode, httpStatus || 0].join('|'));
    try {
      await env.DB.prepare(`INSERT INTO diagnostic_events (fingerprint, category, component, route, error_code, http_status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(fingerprint) DO UPDATE SET
          occurrences = CASE WHEN julianday(diagnostic_events.last_seen) <= julianday('now', '-30 seconds') THEN MIN(diagnostic_events.occurrences + 1, 1000000) ELSE diagnostic_events.occurrences END,
          last_seen = CASE WHEN julianday(diagnostic_events.last_seen) <= julianday('now', '-30 seconds') THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE diagnostic_events.last_seen END,
          status = CASE WHEN diagnostic_events.status = 'resolved' THEN 'open' ELSE diagnostic_events.status END,
          resolved_at = NULL`)
        .bind(key, category, component, route, errorCode, httpStatus).run();
      return json({ ok: true, accepted: true }, 202);
    } catch (error) {
      console.error(JSON.stringify({ where: 'diagnostics.persist', error: error?.name || 'Error' }));
      return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
    }
  }

  if (path === '/api/admin/diagnostics' || path === '/api/admin/diagnostics/resolve') {
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (path.endsWith('/resolve')) {
      if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const key = typeof parsed.body?.fingerprint === 'string' ? parsed.body.fingerprint : '';
      if (!/^[a-f0-9]{64}$/.test(key)) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
      await env.DB.prepare("UPDATE diagnostic_events SET status = 'resolved', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE fingerprint = ?1").bind(key).run();
      return json({ ok: true });
    }
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const result = await env.DB.prepare(`SELECT fingerprint, category, component, route, error_code AS errorCode,
      http_status AS httpStatus, detail, occurrences, status, first_seen AS firstSeen, last_seen AS lastSeen, resolved_at AS resolvedAt
      FROM diagnostic_events ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, last_seen DESC LIMIT 150`).all();
    const items = result?.results || [];
    return json({ ok: true, items, openCount: items.filter((item) => item.status === 'open').length });
  }
  return null;
}
