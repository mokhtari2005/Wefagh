// اعتبارسنجی ورودی‌های تقویم مواعد. خالص و قابل تست.

export const KINDS = Object.freeze(['hearing', 'objection', 'appeal', 'filing', 'other']);

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function clean(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
}

/** @returns {{ok:true, value:object}|{ok:false, errors:Record<string,string>}} */
export function validateDeadline(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { body: 'درخواست نامعتبر است.' } };

  const title = clean(body.title);
  if (title.length < 2 || title.length > 150) errors.title = 'عنوان باید بین ۲ و ۱۵۰ نویسه باشد.';

  const caseNo = clean(body.caseNo);
  if (caseNo.length > 60) errors.caseNo = 'شمارهٔ پرونده بیش از ۶۰ نویسه است.';

  if (!isValidIsoDate(body.dueDate)) errors.dueDate = 'تاریخ معتبر نیست.';

  const kind = typeof body.kind === 'string' && body.kind ? body.kind : 'other';
  if (!KINDS.includes(kind)) errors.kind = 'نوع مهلت معتبر نیست.';

  let dueTime = null;
  if (body.dueTime !== undefined && body.dueTime !== null && body.dueTime !== '') {
    if (typeof body.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.dueTime)) dueTime = body.dueTime;
    else errors.dueTime = 'ساعت باید به شکل HH:MM باشد.';
  }

  const note = typeof body.note === 'string' ? body.note.replace(/\r\n?/g, '\n').trim() : '';
  if (note.length > 1000) errors.note = 'یادداشت بیش از ۱۰۰۰ نویسه است.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      caseNo: caseNo || null,
      dueDate: body.dueDate,
      kind,
      dueTime,
      note: note || null,
    },
  };
}
