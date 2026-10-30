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
    area: c.area,
    difficulty: c.difficulty,
    level: LEVEL_LABEL[c.difficulty] || c.difficulty,
    subject: c.subject,
    parties: c.parties,
    request: c.request,
    facts: c.facts,
    documents: (c.documents || []).map((d) => ({ title: d.title, summary: d.summary })),
    issues: c.issues,
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
export async function listPublishedCases(env, { area = null, difficulty = null, q = null } = {}) {
  if (!env?.DB) return [];
  let result;
  try {
    result = await env.DB.prepare("SELECT slug, title, summary, payload_json FROM admin_content WHERE kind = 'case' AND status = 'published' ORDER BY title LIMIT 500").all();
  } catch (error) {
    console.error('case bank unavailable', String(error?.message || error).slice(0, 120));
    return [];
  }
  const needle = q ? String(q).trim().toLowerCase() : '';
  return (result?.results || [])
    .map(summaryOf)
    .filter(Boolean)
    .filter((c) => !area || c.area === area)
    .filter((c) => !difficulty || c.difficulty === difficulty)
    .filter((c) => !needle || `${c.title} ${c.summary} ${c.subject}`.toLowerCase().includes(needle));
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
