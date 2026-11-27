// دسترسی به بانک پرونده‌ها. منبع واحد: جدول admin_content با kind = 'case'.
// فقط پرونده‌های منتشرشده (status = 'published') به کاربران و هوش مصنوعی داده می‌شوند.
import { AREAS, DIFFICULTIES } from './caseSchema.js';

export const LEVEL_LABEL = Object.freeze({ basic: 'مقدماتی', medium: 'متوسط', advanced: 'پیشرفته' });
export const SLUG_RE = /^[a-z0-9-]{3,64}$/;

/** بخش‌هایی از پرونده که کاربر پیش از شروع جلسه می‌بیند؛ پرسش‌های قاضی، نقاط قوت و ضعف و رأی آموزشی عمداً حذف می‌شوند. */
export function publicCase(c) {
  return {
    id: c.id,
    title: c.title,
    trainingOnly: c.training_only === true && c.scenario_type === 'hypothetical',
    publicationNote: c.training_only === true ? c.publication_note : null,
    area: c.area,
    difficulty: c.difficulty,
    level: LEVEL_LABEL[c.difficulty] || c.difficulty,
    subject: c.subject,
    parties: c.parties,
    request: c.request,
    facts: c.facts,
    documents: (c.documents || []).map((d) => ({ title: d.title, summary: d.summary })),
    issues: c.issues,
    claims: c.claims ? { plaintiff: c.claims.plaintiff, defendant: c.claims.defendant } : null,
    // استناد قانونی: شمارهٔ ماده فقط برای استنادهای تأییدشده یا اصلاح‌شده نمایش داده می‌شود.
    legalRefs: (c.legal_refs || []).map((r) => ({
      law: r.law,
      topic: r.topic,
      article: r.status === 'verified' || r.status === 'corrected' ? (r.article ?? null) : null,
      status: r.status,
      source: r.status === 'verified' || r.status === 'corrected' ? (r.source ?? null) : null,
    })),
  };
}

function parsePayload(json) {
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function summaryOf(row) {
  const c = parsePayload(row.payload_json);
  if (!c) return null;
  return {
    id: row.slug,
    title: row.title,
    trainingOnly: c.training_only === true && c.scenario_type === 'hypothetical',
    summary: row.summary,
    area: c.area,
    difficulty: c.difficulty,
    level: LEVEL_LABEL[c.difficulty] || c.difficulty,
    subject: c.subject,
    issueCount: Array.isArray(c.issues) ? c.issues.length : 0,
  };
}

/**
 * فهرست پرونده‌های منتشرشده. فیلترها: area، difficulty و q (جست‌وجو در عنوان، خلاصه و موضوع دعوا).
 * @returns {Promise<Array<object>>}
 */
function caseFilter({ area = null, difficulty = null, q = null } = {}) {
  const clauses = ["kind = 'case'", "status = 'published'"];
  const values = [];
  if (area) { clauses.push("json_extract(payload_json, '$.area') = ?"); values.push(area); }
  if (difficulty) { clauses.push("json_extract(payload_json, '$.difficulty') = ?"); values.push(difficulty); }
  if (q) {
    clauses.push("lower(title || ' ' || summary || ' ' || coalesce(json_extract(payload_json, '$.subject'), '')) LIKE ?");
    values.push(`%${String(q).trim().toLowerCase()}%`);
  }
  return { where: clauses.join(' AND '), values };
}

/** فهرست صفحه‌بندی‌شدهٔ همه پرونده‌های منتشرشده؛ سقف تعداد کل پرونده‌ها وجود ندارد. */
export async function listPublishedCases(env, { area = null, difficulty = null, q = null, limit = 30, offset = 0 } = {}) {
  if (!env?.DB) return [];
  const filter = caseFilter({ area, difficulty, q });
  const pageSize = Math.max(1, Math.min(50, Number(limit) || 30));
  const startAt = Math.max(0, Number(offset) || 0);
  try {
    const result = await env.DB.prepare(`SELECT slug, title, summary, payload_json FROM admin_content WHERE ${filter.where} ORDER BY title, slug LIMIT ? OFFSET ?`)
      .bind(...filter.values, pageSize, startAt).all();
    return (result?.results || []).map(summaryOf).filter(Boolean);
  } catch (error) {
    console.error('case bank unavailable', String(error?.message || error).slice(0, 120));
    return [];
  }
}

export async function countPublishedCases(env, { area = null, difficulty = null, q = null } = {}) {
  if (!env?.DB) return 0;
  const filter = caseFilter({ area, difficulty, q });
  try {
    const result = await env.DB.prepare(`SELECT COUNT(*) AS total FROM admin_content WHERE ${filter.where}`).bind(...filter.values).first();
    return Number(result?.total || 0);
  } catch (error) {
    console.error('case bank count unavailable', String(error?.message || error).slice(0, 120));
    return 0;
  }
}

/** پرونده کامل منتشرشده با شناسه؛ اگر منتشر نشده باشد null برمی‌گرداند. */
export async function getPublishedCase(env, slug) {
  if (!env?.DB || !SLUG_RE.test(String(slug || ''))) return null;
  try {
    const row = await env.DB.prepare("SELECT slug, title, summary, payload_json FROM admin_content WHERE kind = 'case' AND status = 'published' AND slug = ?1").bind(slug).first();
    if (!row) return null;
    const c = parsePayload(row.payload_json);
    return c ? { ...c, id: row.slug, title: row.title } : null;
  } catch (error) {
    console.error('case lookup failed', String(error?.message || error).slice(0, 120));
    return null;
  }
}

export function isKnownArea(area) { return AREAS.includes(area); }
export function isKnownDifficulty(d) { return DIFFICULTIES.includes(d); }
