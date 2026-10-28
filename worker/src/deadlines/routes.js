// تقویم مواعد شخصی: فهرست، ایجاد، تغییر وضعیت، و حذف. همهٔ مسیرها نیازمند ورود و محدود به مالک‌اند.
import { json, readJsonBody } from '../http.js';
import { currentUser } from '../auth/routes.js';
import { validateDeadline, isValidIsoDate } from './validate.js';

const MAX_LIST = 500;

function rowToDto(r) {
  return {
    id: r.id,
    title: r.title,
    caseNo: r.case_no,
    dueDate: r.due_date,
    kind: r.kind,
    note: r.note,
    done: r.done === 1,
  };
}

export async function handleDeadlines(request, env, path) {
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  // فهرست و ایجاد
  if (path === '/api/deadlines') {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) {
        return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
      }
      let sql = 'SELECT * FROM deadlines WHERE user_id = ?1';
      const binds = [user.id];
      if (from) { sql += ` AND due_date >= ?${binds.length + 1}`; binds.push(from); }
      if (to) { sql += ` AND due_date <= ?${binds.length + 1}`; binds.push(to); }
      sql += ` ORDER BY due_date ASC, id ASC LIMIT ${MAX_LIST}`;
      const rows = await env.DB.prepare(sql).bind(...binds).all();
      return json({ ok: true, deadlines: (rows?.results || []).map(rowToDto) });
    }
    if (request.method === 'POST') {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const v = validateDeadline(parsed.body);
      if (!v.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: v.errors }, 422);
      const row = await env.DB
        .prepare('INSERT INTO deadlines (user_id, title, case_no, due_date, kind, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id')
        .bind(user.id, v.value.title, v.value.caseNo, v.value.dueDate, v.value.kind, v.value.note)
        .first();
      return json({ ok: true, id: row?.id ?? null }, 201);
    }
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST' });
  }

  // تغییر یا حذف یک مورد (فقط مالک)
  const m = path.match(/^\/api\/deadlines\/(\d{1,12})$/);
  if (m) {
    const id = Number(m[1]);
    const owned = await env.DB.prepare('SELECT id FROM deadlines WHERE id = ?1 AND user_id = ?2').bind(id, user.id).first();
    if (!owned) return json({ ok: false, error: 'NOT_FOUND' }, 404);

    if (request.method === 'PATCH') {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      if (typeof parsed.body?.done !== 'boolean') return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
      await env.DB.prepare('UPDATE deadlines SET done = ?1 WHERE id = ?2 AND user_id = ?3')
        .bind(parsed.body.done ? 1 : 0, id, user.id)
        .run();
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM deadlines WHERE id = ?1 AND user_id = ?2').bind(id, user.id).run();
      return json({ ok: true });
    }
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'PATCH, DELETE' });
  }

  return null;
}
