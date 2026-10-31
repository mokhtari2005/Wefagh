// بارگذاری بانک پرونده‌ها در پایگاه داده به‌صورت پیش‌نویس، و گزارش یکپارچگی آن.
// ایمن و تکرارپذیر: پرونده‌هایی که از قبل وجود دارند بازنویسی نمی‌شوند؛ پیش از نوشتن، همهٔ پرونده‌ها اعتبارسنجی می‌شوند.
import { json } from './http.js';
import { requireAdmin } from './admin.js';
import { validateCase } from './moot/caseSchema.js';
import { BANK_CASES, BANK_REVIEW_LABEL } from './moot/bank/index.js';
import { COURSES } from './academy/catalog.js';

const CHUNK = 25;

function rowFor(c) {
  return {
    slug: c.id,
    title: c.title,
    summary: `${c.area} ـ ${c.subject}`,
    payload: { ...c, review_status: BANK_REVIEW_LABEL },
  };
}

/** همهٔ پرونده‌ها را پیش از هر نوشتنی بررسی می‌کند. */
function buildPlan() {
  const invalid = [];
  const seen = new Set();
  const rows = [];
  for (const c of BANK_CASES) {
    const v = validateCase(c, { status: 'draft' });
    const row = rowFor(c);
    if (seen.has(c.id)) invalid.push({ id: c.id, errors: ['شناسهٔ تکراری در بانک'] });
    seen.add(c.id);
    if (!v.ok) { invalid.push({ id: c.id, errors: v.errors }); continue; }
    if (row.summary.length < 10 || row.summary.length > 500 || c.title.length > 140) {
      invalid.push({ id: c.id, errors: ['طول خلاصه یا عنوان با محدودیت پایگاه داده سازگار نیست'] });
      continue;
    }
    rows.push(row);
  }
  return { rows, invalid };
}

async function existingSlugs(env) {
  const res = await env.DB.prepare("SELECT slug FROM admin_content WHERE kind = 'case'").all();
  return new Set((res?.results || []).map((r) => r.slug));
}

async function handleImport(request, env, access) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const plan = buildPlan();
  if (plan.invalid.length) {
    return json({ ok: false, error: 'BANK_INVALID', total: BANK_CASES.length, invalid: plan.invalid.slice(0, 50) }, 422);
  }
  const existing = await existingSlugs(env);
  const toInsert = plan.rows.filter((r) => !existing.has(r.slug));
  if (dryRun) {
    return json({ ok: true, dryRun: true, total: plan.rows.length, wouldInsert: toInsert.length, skippedExisting: plan.rows.length - toInsert.length });
  }
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const stmts = toInsert.slice(i, i + CHUNK).map((r) => env.DB
      .prepare(`INSERT OR IGNORE INTO admin_content (kind, slug, title, summary, status, payload_json, created_by)
        VALUES ('case', ?1, ?2, ?3, 'draft', ?4, ?5)`)
      .bind(r.slug, r.title, r.summary, JSON.stringify(r.payload), access.user.id));
    await env.DB.batch(stmts);
  }
  return json({ ok: true, total: plan.rows.length, inserted: toInsert.length, skippedExisting: plan.rows.length - toInsert.length }, 201);
}

async function handleStatus(env) {
  const res = await env.DB.prepare("SELECT slug, title, status, payload_json FROM admin_content WHERE kind = 'case'").all();
  const rows = res?.results || [];
  const bySlug = new Map(BANK_CASES.map((c) => [c.id, c]));
  const counts = { draft: 0, review: 0, published: 0, retired: 0, other: 0 };
  let intact = 0;
  let verifiedRefs = 0;
  const changed = [];
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    let payload = null;
    try { payload = JSON.parse(row.payload_json); } catch { changed.push(row.slug); continue; }
    if (Array.isArray(payload?.legal_refs)) verifiedRefs += payload.legal_refs.filter((r) => r.status === 'verified').length;
    const bank = bySlug.get(row.slug);
    if (!bank) continue;
    const { review_status: _review, ...stored } = payload;
    if (JSON.stringify(stored) === JSON.stringify(bank)) intact += 1; else changed.push(row.slug);
  }
  const dbSlugs = new Set(rows.map((r) => r.slug));
  const missing = BANK_CASES.filter((c) => !dbSlugs.has(c.id)).map((c) => c.id);
  const extra = rows.filter((r) => !bySlug.has(r.slug)).map((r) => r.slug);
  return json({
    ok: true,
    bankTotal: BANK_CASES.length,
    dbTotal: rows.length,
    counts,
    intact,
    missing,
    extra,
    changed,
    verifiedRefs,
    publishedVisible: counts.published,
  });
}

/** دوره‌های داخلی را به‌صورت پیش‌نویس در پنل مدیریت قابل ویرایش و تأیید می‌کند؛ دوره‌های موجود بازنویسی نمی‌شوند. */
async function handleCourseImport(env, access) {
  const existing = new Set((await env.DB.prepare("SELECT slug FROM admin_content WHERE kind = 'course'").all())?.results?.map((r) => r.slug) || []);
  const toInsert = COURSES.filter((c) => !existing.has(c.id) && c.lessons.length >= 1 && c.lessons.length <= 40);
  for (const c of toInsert) {
    const payload = { level: c.level, lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, body: l.body })) };
    await env.DB.prepare(`INSERT OR IGNORE INTO admin_content (kind, slug, title, summary, status, payload_json, created_by)
      VALUES ('course', ?1, ?2, ?3, 'draft', ?4, ?5)`)
      .bind(c.id, c.title, c.summary, JSON.stringify(payload), access.user.id).run();
  }
  return json({ ok: true, total: COURSES.length, inserted: toInsert.length, skippedExisting: COURSES.length - toInsert.length }, 201);
}

export async function handleAdminCases(request, env, path) {
  if (path === '/api/admin/courses/import-builtin') {
    if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
    const access = await requireAdmin(request, env);
    if (access.response) return access.response;
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    return handleCourseImport(env, access);
  }
  if (path !== '/api/admin/cases/import' && path !== '/api/admin/cases/status') return null;
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const access = await requireAdmin(request, env);
  if (access.response) return access.response;
  if (path === '/api/admin/cases/import') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    return handleImport(request, env, access);
  }
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  return handleStatus(env);
}
