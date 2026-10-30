// تاریخچهٔ گفت‌وگوی دستیار وکیل در D1: فهرست، بازیابی، ساخت، افزودن پیام و حذف.
// هر کاربر فقط گفت‌وگوهای خودش را می‌بیند؛ گفت‌وگوی دیگران با ۴۰۴ پاسخ داده می‌شود (بدون افشای وجود آن).
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';

const ID_RE = /^[1-9][0-9]{0,15}$/;
const MAX_MESSAGE = 12000;
const MAX_THREADS_LISTED = 50;
const MAX_MESSAGES_PER_THREAD = 200;

function fail(code, status, extra = {}) {
  return json({ ok: false, error: code, ...extra }, status);
}

async function ownThread(env, userId, threadId) {
  return env.DB.prepare('SELECT id, title, created_at, updated_at FROM assistant_threads WHERE id = ?1 AND user_id = ?2')
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
        .prepare('SELECT id, title, created_at, updated_at FROM assistant_threads WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT ?2')
        .bind(user.id, MAX_THREADS_LISTED)
        .all();
      return json({ ok: true, threads: rows?.results || [] });
    }
    if (request.method === 'POST') {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const title = cleanTitle(parsed.body?.title);
      const row = await env.DB
        .prepare('INSERT INTO assistant_threads (user_id, title) VALUES (?1, ?2) RETURNING id, title, created_at, updated_at')
        .bind(user.id, title)
        .first();
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
        .prepare('SELECT role, content, created_at FROM assistant_messages WHERE thread_id = ?1 ORDER BY id ASC LIMIT ?2')
        .bind(thread.id, MAX_MESSAGES_PER_THREAD)
        .all();
      return json({ ok: true, messages: rows?.results || [] });
    }
    if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);
    const parsed = await readJsonBody(request);
    if (parsed.error) return parsed.error;
    const role = parsed.body?.role;
    const content = typeof parsed.body?.content === 'string' ? parsed.body.content.trim() : '';
    if (!['user', 'ai'].includes(role) || !content || content.length > MAX_MESSAGE) {
      return fail('VALIDATION_FAILED', 422, { field: 'content' });
    }
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE thread_id = ?1').bind(thread.id).first();
    if ((count?.n || 0) >= MAX_MESSAGES_PER_THREAD) return fail('THREAD_FULL', 409);
    const nowIso = new Date().toISOString();
    await env.DB
      .prepare('INSERT INTO assistant_messages (thread_id, role, content) VALUES (?1, ?2, ?3)')
      .bind(thread.id, role, content)
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
