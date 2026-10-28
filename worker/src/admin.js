// پنل محتوای آکادمی؛ همهٔ مسیرها نیازمند نقش مدیر و اعتبارسنجی سمت سرور هستند.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = new Set(['course', 'case']);
const STATUSES = new Set(['draft', 'published']);
const clean = (v) => typeof v === 'string' ? v.trim() : '';
const bounded = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

function validatePayload(kind, payload) {
  const errors = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, errors: { payload: 'ساختار محتوا نامعتبر است.' } };
  if (kind === 'course') {
    if (!bounded(payload.level, 2, 40)) errors.level = 'سطح دوره باید بین ۲ تا ۴۰ نویسه باشد.';
    if (!Array.isArray(payload.lessons) || payload.lessons.length < 1 || payload.lessons.length > 40) errors.lessons = 'دوره باید بین ۱ تا ۴۰ درس داشته باشد.';
    else {
      const ids = new Set();
      payload.lessons.forEach((lesson, i) => {
        if (!lesson || !/^[a-z0-9-]{1,64}$/.test(lesson.id || '') || ids.has(lesson.id)) errors.lessons = `شناسهٔ درس شمارهٔ ${i + 1} نامعتبر یا تکراری است.`;
        ids.add(lesson?.id);
        if (!bounded(lesson.title, 2, 140)) errors.lessons = `عنوان درس شمارهٔ ${i + 1} نامعتبر است.`;
        if (!bounded(lesson.body, 20, 10000)) errors.lessons = `متن درس شمارهٔ ${i + 1} باید ۲۰ تا ۱۰۰۰۰ نویسه باشد.`;
      });
    }
  } else if (kind === 'case') {
    if (!bounded(payload.area, 2, 80)) errors.area = 'حوزهٔ پرونده نامعتبر است.';
    if (!bounded(payload.level, 2, 40)) errors.level = 'سطح پرونده نامعتبر است.';
    for (const field of ['facts', 'evidence']) {
      if (!Array.isArray(payload[field]) || payload[field].length < 1 || payload[field].length > 30 || payload[field].some((x) => !bounded(x, 5, 1000))) errors[field] = `${field === 'facts' ? 'وقایع' : 'مدارک'} باید ۱ تا ۳۰ مورد معتبر داشته باشند.`;
    }
    if (!Array.isArray(payload.issues) || payload.issues.length < 1 || payload.issues.length > 20 || payload.issues.some((x) => !x || !/^[a-z0-9-]{1,64}$/.test(x.id || '') || !bounded(x.text, 8, 500))) errors.issues = 'مسائل پرونده باید ۱ تا ۲۰ مورد با شناسه و متن معتبر باشند.';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: payload };
}

function dto(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json); } catch { /* دادهٔ خراب به‌صورت payload خالی برگردانده می‌شود */ }
  return { id: row.id, kind: row.kind, slug: row.slug, title: row.title, summary: row.summary, status: row.status, payload, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function requireAdmin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ ok: false, error: 'UNAUTHENTICATED' }, 401) };
  if (!user.roles.some((role) => role === 'admin' || role === 'super_admin' || role === 'academy_manager')) return { response: json({ ok: false, error: 'FORBIDDEN' }, 403) };
  return { user };
}

export async function handleAdmin(request, env, path) {
  if (path !== '/api/admin/content' && !path.startsWith('/api/admin/content/')) return null;
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const access = await requireAdmin(request, env);
  if (access.response) return access.response;

  if (path === '/api/admin/content') {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const kind = url.searchParams.get('kind');
      if (kind && !KINDS.has(kind)) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
      const result = kind
        ? await env.DB.prepare('SELECT * FROM admin_content WHERE kind = ?1 ORDER BY updated_at DESC, id DESC LIMIT 200').bind(kind).all()
        : await env.DB.prepare('SELECT * FROM admin_content ORDER BY updated_at DESC, id DESC LIMIT 200').all();
      return json({ ok: true, items: (result?.results || []).map(dto) });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST' });
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body || {};
    const kind = body.kind;
    const slug = clean(body.slug);
    const title = clean(body.title);
    const summary = clean(body.summary);
    const status = body.status || 'draft';
    if (!KINDS.has(kind) || !SLUG_RE.test(slug) || slug.length > 64 || !bounded(title, 2, 140) || !bounded(summary, 10, 500) || !STATUSES.has(status)) {
      return json({ ok: false, error: 'VALIDATION_FAILED', errors: { content: 'نوع، شناسه، عنوان، خلاصه یا وضعیت محتوا معتبر نیست.' } }, 422);
    }
    const validated = validatePayload(kind, body.payload);
    if (!validated.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: validated.errors }, 422);
    try {
      const row = await env.DB.prepare(`INSERT INTO admin_content (kind, slug, title, summary, status, payload_json, created_by)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`)
        .bind(kind, slug, title, summary, status, JSON.stringify(validated.value), access.user.id).first();
      return json({ ok: true, id: row?.id ?? null }, 201);
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE')) return json({ ok: false, error: 'DUPLICATE_SLUG' }, 409);
      return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
    }
  }

  const match = path.match(/^\/api\/admin\/content\/(\d{1,10})$/);
  if (!match) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  const id = Number(match[1]);
  const existing = await env.DB.prepare('SELECT * FROM admin_content WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  if (request.method === 'DELETE') {
    if (existing.status === 'published') return json({ ok: false, error: 'UNPUBLISH_BEFORE_DELETE' }, 409);
    await env.DB.prepare('DELETE FROM admin_content WHERE id = ?1').bind(id).run();
    return json({ ok: true });
  }
  if (request.method !== 'PATCH') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'PATCH, DELETE' });
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body || {};
  const kind = existing.kind;
  const slug = body.slug === undefined ? existing.slug : clean(body.slug);
  const title = body.title === undefined ? existing.title : clean(body.title);
  const summary = body.summary === undefined ? existing.summary : clean(body.summary);
  const status = body.status === undefined ? existing.status : body.status;
  let payload = body.payload;
  if (payload === undefined) { try { payload = JSON.parse(existing.payload_json); } catch { payload = null; } }
  if (!SLUG_RE.test(slug) || slug.length > 64 || !bounded(title, 2, 140) || !bounded(summary, 10, 500) || !STATUSES.has(status)) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { content: 'شناسه، عنوان، خلاصه یا وضعیت معتبر نیست.' } }, 422);
  const validated = validatePayload(kind, payload);
  if (!validated.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: validated.errors }, 422);
  try {
    await env.DB.prepare(`UPDATE admin_content SET slug = ?1, title = ?2, summary = ?3, status = ?4, payload_json = ?5,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?6`)
      .bind(slug, title, summary, status, JSON.stringify(validated.value), id).run();
    return json({ ok: true });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return json({ ok: false, error: 'DUPLICATE_SLUG' }, 409);
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }
}
