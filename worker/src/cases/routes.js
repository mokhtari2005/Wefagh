// بانک پرونده‌های آموزشی و ذخیرهٔ خصوصی تمرین موت‌کورت.
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { listPublishedCases, getPublishedCase, publicCase, SLUG_RE } from '../moot/caseStore.js';
import { AREAS, DIFFICULTIES } from '../moot/caseSchema.js';

const ID_RE = /^[a-z0-9-]{1,64}$/;
const STAGES = new Set(['facts', 'answers', 'check', 'result']);
const RUBRIC_MAX = 20;
const ANSWERS_MAX = 12000;

function parseStored(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
function toDto(row) {
  return {
    id: row.id, caseId: row.case_id, title: row.title, stage: row.stage,
    answers: parseStored(row.answers_json, {}), rubric: parseStored(row.rubric_json, []),
    score: row.score, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
async function validateSession(body, env, { partial = false } = {}) {
  const errors = {};
  const value = {};
  if (!partial || body.caseId !== undefined) {
    if (typeof body.caseId !== 'string' || !ID_RE.test(body.caseId) || !(await getPublishedCase(env, body.caseId))) errors.caseId = 'پروندهٔ آموزشی معتبر نیست یا منتشر نشده است.';
    else value.caseId = body.caseId;
  }
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 120) errors.title = 'عنوان باید بین ۲ تا ۱۲۰ نویسه باشد.';
    else value.title = body.title.trim();
  }
  if (!partial || body.answers !== undefined) {
    const a = body.answers;
    if (!a || typeof a !== 'object' || Array.isArray(a) || JSON.stringify(a).length > ANSWERS_MAX || Object.keys(a).length > 30 || Object.values(a).some((v) => typeof v !== 'string' || v.length > 4000)) errors.answers = 'پاسخ‌ها نامعتبر یا بیش از حد طولانی‌اند.';
    else value.answers = a;
  }
  if (!partial || body.rubric !== undefined) {
    if (!Array.isArray(body.rubric) || body.rubric.length > RUBRIC_MAX || body.rubric.some((v) => typeof v !== 'boolean')) errors.rubric = 'خودارزیابی نامعتبر است.';
    else value.rubric = body.rubric;
  }
  if (!partial || body.stage !== undefined) {
    if (!STAGES.has(body.stage)) errors.stage = 'مرحلهٔ تمرین نامعتبر است.';
    else value.stage = body.stage;
  }
  if (body.score !== undefined) {
    if (body.score !== null && (!Number.isInteger(body.score) || body.score < 0 || body.score > 100)) errors.score = 'امتیاز باید عددی بین صفر تا ۱۰۰ باشد.';
    else value.score = body.score;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export async function handleCases(request, env, path) {
  if (path === '/api/cases') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    const url = new URL(request.url);
    const area = url.searchParams.get('area') || null;
    const difficulty = url.searchParams.get('difficulty') || null;
    const q = (url.searchParams.get('q') || '').trim();
    if (area && !AREAS.includes(area)) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { area: 'حوزهٔ حقوقی نامعتبر است.' } }, 422);
    if (difficulty && !DIFFICULTIES.includes(difficulty)) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { difficulty: 'سطح نامعتبر است.' } }, 422);
    if (q.length > 100) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { q: 'عبارت جست‌وجو بیش از ۱۰۰ نویسه است.' } }, 422);
    const cases = await listPublishedCases(env, { area, difficulty, q: q || null });
    return json({ ok: true, cases, total: cases.length });
  }
  const detail = path.match(/^\/api\/cases\/([a-z0-9-]{1,64})$/);
  if (detail) {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    if (!SLUG_RE.test(detail[1])) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    const item = await getPublishedCase(env, detail[1]);
    return item ? json({ ok: true, case: publicCase(item) }) : json({ ok: false, error: 'NOT_FOUND' }, 404);
  }
  if (!path.startsWith('/api/moot/sessions')) return null;
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  if (path === '/api/moot/sessions') {
    if (request.method === 'GET') {
      try {
        const rows = await env.DB.prepare('SELECT * FROM moot_sessions WHERE user_id = ?1 ORDER BY updated_at DESC, id DESC LIMIT 100').bind(user.id).all();
        return json({ ok: true, sessions: (rows?.results || []).map(toDto) });
      } catch (error) {
        console.error('moot_sessions unavailable', String(error?.message || error).slice(0, 120));
        return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
      }
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST' });
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const v = await validateSession(parsed.body || {}, env);
    if (!v.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: v.errors }, 422);
    const s = v.value;
    const row = await env.DB.prepare(`INSERT INTO moot_sessions (user_id, case_id, title, answers_json, rubric_json, stage, score)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`)
      .bind(user.id, s.caseId, s.title, JSON.stringify(s.answers), JSON.stringify(s.rubric), s.stage, s.score ?? null).first();
    return json({ ok: true, id: row?.id ?? null }, 201);
  }

  const match = path.match(/^\/api\/moot\/sessions\/(\d{1,12})$/);
  if (!match) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  const id = Number(match[1]);
  const row = await env.DB.prepare('SELECT * FROM moot_sessions WHERE id = ?1 AND user_id = ?2').bind(id, user.id).first();
  if (!row) return json({ ok: false, error: 'NOT_FOUND' }, 404);
  if (request.method === 'GET') return json({ ok: true, session: toDto(row) });
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM moot_sessions WHERE id = ?1 AND user_id = ?2').bind(id, user.id).run();
    return json({ ok: true });
  }
  if (request.method === 'PATCH') {
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const v = await validateSession(parsed.body || {}, env, { partial: true });
    if (!v.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: v.errors }, 422);
    const allowed = { caseId: 'case_id', title: 'title', answers: 'answers_json', rubric: 'rubric_json', stage: 'stage', score: 'score' };
    const sets = [];
    const binds = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (!(key in v.value)) continue;
      sets.push(`${column} = ?${binds.length + 1}`);
      const val = key === 'answers' || key === 'rubric' ? JSON.stringify(v.value[key]) : v.value[key];
      binds.push(val);
    }
    if (!sets.length) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    binds.push(id, user.id);
    await env.DB.prepare(`UPDATE moot_sessions SET ${sets.join(', ')} WHERE id = ?${binds.length - 1} AND user_id = ?${binds.length}`).bind(...binds).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, PATCH, DELETE' });
}
