// تاریخچهٔ گفت‌وگوی دستیار وکیل در D1: فهرست، بازیابی، ساخت، افزودن پیام و حذف.
// هر کاربر فقط گفت‌وگوهای خودش را می‌بیند؛ گفت‌وگوی دیگران با ۴۰۴ پاسخ داده می‌شود (بدون افشای وجود آن).
import { json } from '../http.js';
import { currentUser } from '../auth/routes.js';

const ID_RE = /^[1-9][0-9]{0,15}$/;
const MAX_MESSAGE = 12000;
const MAX_THREAD_BODY_BYTES = 80 * 1024;
const MAX_THREADS_LISTED = 50;
const MAX_MESSAGES_PER_THREAD = 200;

const MAX_METADATA_CHARS = 8_000;
const MODES = new Set(['consult', 'analyze', 'litigation', 'research', 'review', 'draft']);
const REVIEW_STATUSES = new Set(['reviewed', 'skipped_attachments', 'skipped_fallback', 'not_configured', 'timeout', 'quota_exceeded', 'provider_error', 'invalid_response', 'invalid_input', 'network_error', 'not_run', 'rate_limited', 'unavailable']);
const KNOWN_FIELD_KEYS = new Set([
  'partyOneName', 'partyOneAddress', 'partyTwoName', 'partyTwoAddress', 'court', 'caseNumber',
  'caseStage', 'additionalDetails', 'contractSubject', 'contractAmount', 'contractDuration',
  'incidentDate', 'incidentPlace', 'evidenceSummary', 'issuingCourt', 'judgmentNumber',
  'judgmentDate', 'notificationDate', 'executionCaseNumber', 'enforcementStage',
  'enforcementCaseNumber', 'disputedAction', 'noticeSubject', 'responseDeadline',
]);

function shortText(value, limit) {
  return typeof value === 'string' ? value.replaceAll(String.fromCharCode(0), '').trim().slice(0, limit) : '';
}

function cleanStringArray(value, count, length) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').slice(0, count).map((item) => shortText(item, length)).filter(Boolean)
    : [];
}

function cleanQuestionOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item) => ({
    question: shortText(item?.question, 500),
    options: cleanStringArray(item?.options, 8, 180),
    allowOther: item?.allowOther !== false,
  })).filter((item) => item.question && (item.options.length || item.allowOther));
}

function cleanKnownFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (KNOWN_FIELD_KEYS.has(key) && typeof item === 'string' && item.trim()) {
      output[key] = shortText(item, 600);
    }
  }
  return output;
}

function cleanSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((item) => {
    let url = '';
    if (typeof item?.url === 'string' && item.url.trim()) {
      try {
        const parsed = new URL(item.url);
        if (parsed.protocol === 'https:' && (!parsed.port || parsed.port === '443') && !parsed.username && !parsed.password) url = parsed.href;
      } catch {}
    }
    return {
      type: shortText(item?.type, 40),
      title: shortText(item?.title, 180),
      url,
      domain: shortText(item?.domain, 100),
      status: shortText(item?.status, 120),
      excerpt: shortText(item?.excerpt, 160),
    };
  }).filter((item) => item.title);
}

function cleanReviewReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const report = {
    risk: ['low', 'medium', 'high'].includes(value.risk) ? value.risk : 'medium',
    summary: shortText(value.summary, 1000),
    issues: Array.isArray(value.issues) ? value.issues.slice(0, 6).map((item) => ({
      severity: ['low', 'medium', 'high'].includes(item?.severity) ? item.severity : 'medium',
      category: shortText(item?.category, 180),
      observation: shortText(item?.observation, 400),
      recommendation: shortText(item?.recommendation, 400),
    })) : [],
    citations: Array.isArray(value.citations) ? value.citations.slice(0, 6).map((item) => ({
      citation: shortText(item?.citation, 220),
      concern: shortText(item?.concern, 300),
    })) : [],
    followupQuestions: Array.isArray(value.followupQuestions) ? value.followupQuestions.slice(0, 3).map((item) => ({
      question: shortText(item?.question, 400),
      options: cleanStringArray(item?.options, 6, 150),
      allowOther: item?.allowOther !== false,
    })).filter((item) => item.question) : [],
  };
  return report.summary || report.issues.length || report.citations.length || report.followupQuestions.length ? report : null;
}

/** فقط فراداده‌های مجاز و محدود برای بازیابی کارت‌های تعاملی و گزارش بازبینی ذخیره می‌شود. */
function cleanMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = {};
  if (MODES.has(value.mode)) metadata.mode = value.mode;
  if (['need_info', 'ready'].includes(value.status)) metadata.status = value.status;
  if (typeof value.documentDraft === 'boolean') metadata.documentDraft = value.documentDraft;
  if (typeof value.docType === 'string') metadata.docType = shortText(value.docType, 48);
  if (typeof value.suggestedDocType === 'string') metadata.suggestedDocType = shortText(value.suggestedDocType, 48);
  metadata.questions = cleanStringArray(value.questions, 5, 500);
  metadata.questionOptions = cleanQuestionOptions(value.questionOptions);
  metadata.knownFields = cleanKnownFields(value.knownFields);
  metadata.notes = cleanStringArray(value.notes, 8, 350);
  metadata.sources = cleanSources(value.sources);
  if (REVIEW_STATUSES.has(value.reviewStatus)) metadata.reviewStatus = value.reviewStatus;
  metadata.reviewFollowups = cleanQuestionOptions(value.reviewFollowups);
  const report = cleanReviewReport(value.reviewReport);
  if (report) metadata.reviewReport = report;

  let serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_CHARS) {
    delete metadata.reviewReport;
    serialized = JSON.stringify(metadata);
  }
  if (serialized.length > MAX_METADATA_CHARS) {
    metadata.sources = metadata.sources.slice(0, 4).map(({ type, title, url, domain, status }) => ({ type, title, url, domain, status }));
    serialized = JSON.stringify(metadata);
  }
  if (serialized.length > MAX_METADATA_CHARS) {
    const keys = Object.keys(metadata.knownFields || {}).slice(0, 8);
    metadata.knownFields = Object.fromEntries(keys.map((key) => [key, metadata.knownFields[key].slice(0, 300)]));
    serialized = JSON.stringify(metadata);
  }
  if (serialized.length > MAX_METADATA_CHARS) return {};
  return metadata;
}

function parseMetadata(value) {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? cleanMetadata(parsed) : {};
  } catch {
    return {};
  }
}

async function readThreadJsonBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) return { error: json({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, 415) };
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_THREAD_BODY_BYTES) return { error: json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_THREAD_BODY_BYTES) return { error: json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: json({ ok: false, error: 'INVALID_JSON' }, 400) };
  }
}

function fail(code, status, extra = {}) {
  return json({ ok: false, error: code, ...extra }, status);
}

async function ownThread(env, userId, threadId) {
  return env.DB.prepare('SELECT id, title, case_id, casework_service_id, created_at, updated_at FROM assistant_threads WHERE id = ?1 AND user_id = ?2')
    .bind(threadId, userId)
    .first();
}

function cleanTitle(value) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return text.slice(0, 120) || 'گفت‌وگوی تازه';
}

export async function handleThreads(request, env, path) {
  if (!env.DB) return fail('DB_NOT_CONFIGURED', 503);
  const user = await currentUser(request, env);
  if (!user) return fail('UNAUTHENTICATED', 401);

  const rest = path.slice('/api/ai/threads'.length); // '' | '/:id' | '/:id/messages'
  const match = rest.match(/^(?:\/([^/]+))?(\/messages)?$/);
  if (!match) return fail('NOT_FOUND', 404);
  const threadId = match[1];
  const isMessages = Boolean(match[2]);

  if (!threadId) {
    if (request.method === 'GET') {
      const rows = await env.DB
        .prepare('SELECT id, title, case_id, casework_service_id, created_at, updated_at FROM assistant_threads WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT ?2')
        .bind(user.id, MAX_THREADS_LISTED)
        .all();
      return json({ ok: true, threads: rows?.results || [] });
    }
    if (request.method === 'POST') {
      const parsed = await readThreadJsonBody(request);
      if (parsed.error) return parsed.error;
      const title = cleanTitle(parsed.body?.title);
      const caseId = typeof parsed.body?.caseId === 'string' ? parsed.body.caseId : '';
      const serviceId = typeof parsed.body?.caseworkServiceId === 'string' ? parsed.body.caseworkServiceId : '';
      if (caseId && !/^[0-9a-f-]{36}$/i.test(caseId)) return fail('INVALID_CASE', 422);
      if (serviceId && !/^[0-9a-f-]{36}$/i.test(serviceId)) return fail('INVALID_SERVICE', 422);
      if (caseId) {
        const parent = await env.DB.prepare('SELECT id FROM case_records WHERE id=?1 AND user_id=?2 AND deleted_at IS NULL').bind(caseId, user.id).first();
        if (!parent) return fail('CASE_NOT_FOUND', 404);
      }
      if (serviceId) {
        const service = await env.DB.prepare('SELECT id FROM case_services WHERE id=?1 AND case_id=?2 AND user_id=?3').bind(serviceId, caseId, user.id).first();
        if (!service) return fail('SERVICE_NOT_FOUND', 404);
      }
      if (serviceId && !caseId) return fail('CASE_REQUIRED_FOR_SERVICE', 422);
      const row = await env.DB
        .prepare('INSERT INTO assistant_threads (user_id, title, case_id, casework_service_id) VALUES (?1, ?2, ?3, ?4) RETURNING id, title, case_id, casework_service_id, created_at, updated_at')
        .bind(user.id, title, caseId || null, serviceId || null)
        .first();
      if (caseId) {
        const now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO case_timeline(case_id,user_id,service_id,event_type,title,details_json)
          VALUES(?1,?2,?3,'assistant_thread_linked','گفت‌وگوی دستیار وکیل به پرونده متصل شد',?4)`)
          .bind(caseId, user.id, serviceId || null, JSON.stringify({ threadId: row?.id })).run();
        await env.DB.prepare('UPDATE case_records SET last_activity_at=?1,updated_at=?1 WHERE id=?2 AND user_id=?3')
          .bind(now, caseId, user.id).run();
      }
      return json({ ok: true, thread: row }, 201);
    }
    return fail('METHOD_NOT_ALLOWED', 405);
  }

  if (!ID_RE.test(threadId)) return fail('VALIDATION_FAILED', 422, { field: 'id' });
  const thread = await ownThread(env, user.id, threadId);
  if (!thread) return fail('NOT_FOUND', 404);

  if (isMessages) {
    if (request.method === 'GET') {
      const rows = await env.DB
        .prepare('SELECT role, content, metadata_json, created_at FROM assistant_messages WHERE thread_id = ?1 ORDER BY id ASC LIMIT ?2')
        .bind(thread.id, MAX_MESSAGES_PER_THREAD)
        .all();
      return json({ ok: true, messages: (rows?.results || []).map((row) => ({ ...row, metadata: parseMetadata(row.metadata_json) })) });
    }
    if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);
    const parsed = await readThreadJsonBody(request);
    if (parsed.error) return parsed.error;
    const role = parsed.body?.role;
    const content = typeof parsed.body?.content === 'string' ? parsed.body.content.trim() : '';
    const metadata = role === 'ai' ? cleanMetadata(parsed.body?.metadata) : {};
    if (!['user', 'ai'].includes(role) || !content || content.length > MAX_MESSAGE) {
      return fail('VALIDATION_FAILED', 422, { field: 'content' });
    }
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE thread_id = ?1').bind(thread.id).first();
    if ((count?.n || 0) >= MAX_MESSAGES_PER_THREAD) return fail('THREAD_FULL', 409);
    const nowIso = new Date().toISOString();
    await env.DB
      .prepare('INSERT INTO assistant_messages (thread_id, role, content, metadata_json) VALUES (?1, ?2, ?3, ?4)')
      .bind(thread.id, role, content, JSON.stringify(metadata))
      .run();
    await env.DB.prepare('UPDATE assistant_threads SET updated_at = ?1 WHERE id = ?2').bind(nowIso, thread.id).run();
    return json({ ok: true }, 201);
  }

  if (request.method === 'GET') {
    return json({ ok: true, thread });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM assistant_threads WHERE id = ?1 AND user_id = ?2').bind(thread.id, user.id).run();
    return json({ ok: true });
  }
  return fail('METHOD_NOT_ALLOWED', 405);
}
