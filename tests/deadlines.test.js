import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { validateDeadline } from '../worker/src/deadlines/validate.js';

let DatabaseSync;
let sqliteAvailable = true;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  sqliteAvailable = false;
}
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');

function d1Like(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
      return {
        bind(...args) {
          return {
            first: async () => stmt.get(...args) ?? null,
            all: async () => ({ success: true, results: stmt.all(...args).map((r) => ({ ...r })) }),
            run: async () => {
              stmt.run(...args);
              return { success: true, results: [] };
            },
          };
        },
      };
    },
  };
}

async function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of ['0001_init.sql', '0002_auth.sql', '0003_academy.sql', '0004_deadlines.sql', '0011_deadline_time.sql']) db.exec(migration(f));
  const env = { DB: d1Like(db) };
  const make = async (email, token) => {
    const u = db
      .prepare(`INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?, 'h', 'کاربر', '2026-01-01T00:00:00Z') RETURNING id`)
      .get(email);
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), u.id, '2099-01-01T00:00:00.000Z');
    return { cookie: `wefagh_session=${token}`, id: u.id };
  };
  const a = await make('a@example.com', 'token-a-0123456789-abcdef');
  const b = await make('b@example.com', 'token-b-0123456789-abcdef');
  return { db, env, a, b };
}

const call = (env, path, { method = 'GET', body, cookie } = {}) => {
  const init = { method, headers: {} };
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return worker.fetch(new Request(`https://wefagh.ir${path}`, init), env);
};

const valid = { title: 'جلسه دادگاه', caseNo: '123/45', dueDate: '2026-11-03', kind: 'hearing', note: 'ساعت ۹' };

test('validateDeadline: ورودی معتبر پاک‌سازی می‌شود', () => {
  const v = validateDeadline(valid);
  assert.equal(v.ok, true);
  assert.equal(v.value.dueDate, '2026-11-03');
  assert.equal(v.value.kind, 'hearing');
});

test('validateDeadline: تاریخ نامعتبر، نوع ناشناخته و عنوان خالی رد می‌شود', () => {
  for (const bad of [
    { ...valid, dueDate: '2026-02-30' },
    { ...valid, dueDate: '03/11/2026' },
    { ...valid, kind: 'x' },
    { ...valid, title: '   ' },
    null,
  ]) {
    const v = validateDeadline(bad);
    assert.equal(v.ok, false);
  }
});

test('validateDeadline: یادداشت و شمارهٔ پرونده اختیاری‌اند', () => {
  const v = validateDeadline({ title: 'مهلت', dueDate: '2026-12-01', kind: 'other' });
  assert.equal(v.ok, true);
  assert.ok(!v.value.note);
  assert.ok(!v.value.caseNo);
});

test('بدون ورود، تقویم در دسترس نیست', { skip }, async () => {
  const { env } = await setup();
  const res = await call(env, '/api/deadlines');
  assert.equal(res.status, 401);
});

test('ایجاد، فهرست، تغییر وضعیت و حذف با مالکیت', { skip }, async () => {
  const { env, a } = await setup();

  const created = await call(env, '/api/deadlines', { method: 'POST', body: valid, cookie: a.cookie });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.ok(id);

  const list = await (await call(env, '/api/deadlines', { cookie: a.cookie })).json();
  assert.equal(list.deadlines.length, 1);
  assert.equal(list.deadlines[0].title, 'جلسه دادگاه');
  assert.equal(list.deadlines[0].done, false);
  assert.equal(list.deadlines[0].caseNo, '123/45');

  const done = await call(env, `/api/deadlines/${id}`, { method: 'PATCH', body: { done: true }, cookie: a.cookie });
  assert.equal(done.status, 200);
  const after = await (await call(env, '/api/deadlines', { cookie: a.cookie })).json();
  assert.equal(after.deadlines[0].done, true);

  const del = await call(env, `/api/deadlines/${id}`, { method: 'DELETE', cookie: a.cookie });
  assert.equal(del.status, 200);
  const empty = await (await call(env, '/api/deadlines', { cookie: a.cookie })).json();
  assert.equal(empty.deadlines.length, 0);
});

test('کاربر دیگر نمی‌تواند مهلت دیگری را ببیند، تغییر دهد یا حذف کند', { skip }, async () => {
  const { env, a, b } = await setup();
  const created = await call(env, '/api/deadlines', { method: 'POST', body: valid, cookie: a.cookie });
  const { id } = await created.json();

  const listB = await (await call(env, '/api/deadlines', { cookie: b.cookie })).json();
  assert.equal(listB.deadlines.length, 0);

  assert.equal((await call(env, `/api/deadlines/${id}`, { method: 'PATCH', body: { done: true }, cookie: b.cookie })).status, 404);
  assert.equal((await call(env, `/api/deadlines/${id}`, { method: 'DELETE', cookie: b.cookie })).status, 404);

  const stillThere = await (await call(env, '/api/deadlines', { cookie: a.cookie })).json();
  assert.equal(stillThere.deadlines[0].done, false);
});

test('فیلتر بازه از/تا و مرتب‌سازی بر اساس تاریخ', { skip }, async () => {
  const { env, a } = await setup();
  for (const d of ['2026-12-01', '2026-10-30', '2026-11-15']) {
    await call(env, '/api/deadlines', { method: 'POST', body: { ...valid, dueDate: d }, cookie: a.cookie });
  }
  const all = await (await call(env, '/api/deadlines', { cookie: a.cookie })).json();
  assert.deepEqual(all.deadlines.map((x) => x.dueDate), ['2026-10-30', '2026-11-15', '2026-12-01']);

  const ranged = await (await call(env, '/api/deadlines?from=2026-11-01&to=2026-11-30', { cookie: a.cookie })).json();
  assert.deepEqual(ranged.deadlines.map((x) => x.dueDate), ['2026-11-15']);

  const bad = await call(env, '/api/deadlines?from=yesterday', { cookie: a.cookie });
  assert.equal(bad.status, 422);
});

test('ورودی بد و شناسهٔ غیرعددی خطای مناسب می‌دهد', { skip }, async () => {
  const { env, a } = await setup();
  const bad = await call(env, '/api/deadlines', { method: 'POST', body: { title: '', dueDate: 'x', kind: 'y' }, cookie: a.cookie });
  assert.equal(bad.status, 422);
  const body = await bad.json();
  assert.ok(body.errors.title && body.errors.dueDate && body.errors.kind);

  assert.equal((await call(env, '/api/deadlines/abc', { method: 'DELETE', cookie: a.cookie })).status, 404);
  assert.equal((await call(env, '/api/deadlines', { method: 'PUT', cookie: a.cookie })).status, 405);
});

test('ساعت اختیاری است و قالب نامعتبر رد می‌شود', () => {
  assert.equal(validateDeadline({ ...valid, dueTime: '09:30' }).value.dueTime, '09:30');
  assert.equal(validateDeadline(valid).value.dueTime, null);
  assert.equal(validateDeadline({ ...valid, dueTime: '25:00' }).errors.dueTime !== undefined, true);
  assert.equal(validateDeadline({ ...valid, dueTime: '9:30' }).errors.dueTime !== undefined, true);
});

test('ثبت با ساعت، ویرایش کامل با PUT و رعایت مالکیت', { skip }, async () => {
  const { env, a, b } = await setup();
  const created = await call(env, '/api/deadlines', { method: 'POST', body: { ...valid, dueTime: '10:00' }, cookie: a.cookie });
  const { id } = await created.json();
  const first = (await (await call(env, '/api/deadlines', { cookie: a.cookie })).json()).deadlines[0];
  assert.equal(first.dueTime, '10:00');

  const edited = await call(env, `/api/deadlines/${id}`, { method: 'PUT', body: { ...valid, title: 'جلسه تجدیدنظر', dueDate: '2026-11-20', dueTime: '', note: 'یادداشت جدید' }, cookie: a.cookie });
  assert.equal(edited.status, 200);
  const updated = (await (await call(env, '/api/deadlines', { cookie: a.cookie })).json()).deadlines[0];
  assert.equal(updated.title, 'جلسه تجدیدنظر');
  assert.equal(updated.dueDate, '2026-11-20');
  assert.equal(updated.dueTime, null);
  assert.equal(updated.note, 'یادداشت جدید');

  const bad = await call(env, `/api/deadlines/${id}`, { method: 'PUT', body: { ...valid, title: 'x' }, cookie: a.cookie });
  assert.equal(bad.status, 422);

  const other = await call(env, `/api/deadlines/${id}`, { method: 'PUT', body: { ...valid, title: 'هک' }, cookie: b.cookie });
  assert.equal(other.status, 404);
});
