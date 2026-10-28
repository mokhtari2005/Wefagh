// مدیریت مقاله‌ها و قسمت‌های پادکست؛ فقط مدیر مجاز و اعتبارسنجی سمت سرور.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';

const KINDS = new Set(['article', 'episode']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const clean = (v) => typeof v === 'string' ? v.trim() : '';

function validate(kind, p) {
  const errors = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, errors: { payload: 'ساختار محتوا نامعتبر است.' } };
  if (kind === 'article') {
    if (!text(p.author, 2, 120)) errors.author = 'نام نویسنده باید ۲ تا ۱۲۰ نویسه باشد.';
    if (!Array.isArray(p.body) || p.body.length < 1 || p.body.length > 80 || p.body.some((x) => !text(x, 20, 8000))) errors.body = 'متن مقاله باید ۱ تا ۸۰ بند معتبر داشته باشد.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.publishedAt || '') || Number.isNaN(Date.parse(`${p.publishedAt}T00:00:00Z`))) errors.publishedAt = 'تاریخ انتشار باید به شکل YYYY-MM-DD باشد.';
  } else {
    if (!text(p.description, 10, 1200)) errors.description = 'توضیحات قسمت باید ۱۰ تا ۱۲۰۰ نویسه باشد.';
    if (p.audioUrl !== null && p.audioUrl !== undefined && (!text(p.audioUrl, 9, 1000) || !/^https:\/\//i.test(p.audioUrl))) errors.audioUrl = 'نشانی فایل صوتی باید HTTPS باشد یا خالی بماند.';
    if (p.durationMinutes !== null && p.durationMinutes !== undefined && (!Number.isInteger(p.durationMinutes) || p.durationMinutes < 1 || p.durationMinutes > 600)) errors.durationMinutes = 'مدت باید بین ۱ تا ۶۰۰ دقیقه باشد.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.publishedAt || '') || Number.isNaN(Date.parse(`${p.publishedAt}T00:00:00Z`))) errors.publishedAt = 'تاریخ انتشار باید به شکل YYYY-MM-DD باشد.';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: p };
}
function dto(row) { let payload = {}; try { payload = JSON.parse(row.payload_json); } catch {} return { id: row.id, kind: row.kind, slug: row.slug, title: row.title, summary: row.summary, status: row.status, payload, createdAt: row.created_at, updatedAt: row.updated_at }; }
async function admin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ ok: false, error: 'UNAUTHENTICATED' }, 401) };
  if (!user.roles.some((r) => r === 'admin' || r === 'super_admin' || r === 'media_editor')) return { response: json({ ok: false, error: 'FORBIDDEN' }, 403) };
  return { user };
}
export async function handleAdminMedia(request, env, path) {
  if (path !== '/api/admin/media' && !path.startsWith('/api/admin/media/')) return null;
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const a = await admin(request, env); if (a.response) return a.response;
  if (path === '/api/admin/media') {
    if (request.method === 'GET') {
      const kind = new URL(request.url).searchParams.get('kind');
      if (kind && !KINDS.has(kind)) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
      const rows = kind ? await env.DB.prepare('SELECT * FROM admin_media WHERE kind = ?1 ORDER BY updated_at DESC LIMIT 200').bind(kind).all() : await env.DB.prepare('SELECT * FROM admin_media ORDER BY updated_at DESC LIMIT 200').all();
      return json({ ok: true, items: (rows?.results || []).map(dto) });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST' });
    const parsed = await readJsonBody(request); if (parsed.error) return parsed.error;
    const b = parsed.body || {}; const kind = b.kind; const slug = clean(b.slug); const title = clean(b.title); const summary = clean(b.summary); const status = b.status || 'draft';
    if (!KINDS.has(kind) || !SLUG.test(slug) || slug.length > 100 || !text(title, 2, 160) || !text(summary, 10, 600) || !['draft', 'published'].includes(status)) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { content: 'نوع، شناسه، عنوان، خلاصه یا وضعیت نامعتبر است.' } }, 422);
    const v = validate(kind, b.payload); if (!v.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: v.errors }, 422);
    try { const row = await env.DB.prepare('INSERT INTO admin_media (kind,slug,title,summary,status,payload_json,created_by) VALUES (?1,?2,?3,?4,?5,?6,?7) RETURNING id').bind(kind, slug, title, summary, status, JSON.stringify(v.value), a.user.id).first(); return json({ ok: true, id: row?.id ?? null }, 201); }
    catch (e) { return String(e?.message || '').includes('UNIQUE') ? json({ ok: false, error: 'DUPLICATE_SLUG' }, 409) : json({ ok: false, error: 'INTERNAL_ERROR' }, 500); }
  }
  const m = path.match(/^\/api\/admin\/media\/(\d{1,10})$/); if (!m) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  const id = Number(m[1]); const row = await env.DB.prepare('SELECT * FROM admin_media WHERE id = ?1').bind(id).first(); if (!row) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  if (request.method === 'DELETE') { if (row.status === 'published') return json({ ok: false, error: 'UNPUBLISH_BEFORE_DELETE' }, 409); await env.DB.prepare('DELETE FROM admin_media WHERE id = ?1').bind(id).run(); return json({ ok: true }); }
  if (request.method !== 'PATCH') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'PATCH, DELETE' });
  const parsed = await readJsonBody(request); if (parsed.error) return parsed.error; const b = parsed.body || {};
  const slug = b.slug === undefined ? row.slug : clean(b.slug); const title = b.title === undefined ? row.title : clean(b.title); const summary = b.summary === undefined ? row.summary : clean(b.summary); const status = b.status === undefined ? row.status : b.status;
  let payload = b.payload; if (payload === undefined) { try { payload = JSON.parse(row.payload_json); } catch { payload = null; } }
  if (!SLUG.test(slug) || slug.length > 100 || !text(title, 2, 160) || !text(summary, 10, 600) || !['draft', 'published'].includes(status)) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
  const v = validate(row.kind, payload); if (!v.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: v.errors }, 422);
  try { await env.DB.prepare("UPDATE admin_media SET slug=?1,title=?2,summary=?3,status=?4,payload_json=?5,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?6").bind(slug,title,summary,status,JSON.stringify(v.value),id).run(); return json({ ok: true }); }
  catch (e) { return String(e?.message || '').includes('UNIQUE') ? json({ ok: false, error: 'DUPLICATE_SLUG' }, 409) : json({ ok: false, error: 'INTERNAL_ERROR' }, 500); }
}
