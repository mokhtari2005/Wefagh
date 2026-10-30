// تست یکپارچه: تاریخچهٔ گفت‌وگوی دستیار در D1 (SQLite واقعی). جداسازی کاربران و اعتبارسنجی ورودی.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';

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
            all: async () => ({ success: true, results: stmt.all(...args) }),
            run: async () => {
              if (/RETURNING/i.test(sql)) return { success: true, results: stmt.all(...args) };
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
  db.exec(migration('0001_init.sql'));
  db.exec(migration('0002_auth.sql'));
  db.exec(migration('0010_assistant_threads.sql'));
  const env = { DB: d1Like(db) };
  const cookies = {};
  for (const name of ['الف', 'ب']) {
    const display = name === 'الف' ? 'کاربر الف' : 'کاربر ب ب';
    const u = db
      .prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?1, 'h', ?2, '2026-01-01T00:00:00Z') RETURNING id")
      .get(`${name}@example.com`, display);
    const token = `token-${name === 'الف' ? 'a' : 'b'}-${'x'.repeat(24)}`;
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), u.id, '2099-01-01T00:00:00.000Z');
    cookies[name] = `wefagh_session=${token}`;
  }
  return { db, env, cookies };
}

function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return new Request(`https://wefagh.ir${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

test('بدون ورود به تاریخچه دستیار دسترسی نیست', { skip }, async () => {
  const { env } = await setup();
  assert.equal((await worker.fetch(req('/api/ai/threads'), env)).status, 401);
});

test('ساخت گفت‌وگو، افزودن پیام و بازیابی ترتیب‌دار', { skip }, async () => {
  const { env, cookies } = await setup();
  const created = await (await worker.fetch(req('/api/ai/threads', { method: 'POST', body: { title: '  پروندهٔ  اجاره  ' }, cookie: cookies['الف'] }), env)).json();
  assert.equal(created.ok, true);
  assert.equal(created.thread.title, 'پروندهٔ اجاره');
  const id = created.thread.id;

  for (const [role, content] of [['user', 'سلام'], ['ai', 'پاسخ'], ['user', 'ادامه']]) {
    const r = await worker.fetch(req(`/api/ai/threads/${id}/messages`, { method: 'POST', body: { role, content }, cookie: cookies['الف'] }), env);
    assert.equal(r.status, 201);
  }
  const msgs = await (await worker.fetch(req(`/api/ai/threads/${id}/messages`, { cookie: cookies['الف'] }), env)).json();
  assert.deepEqual(msgs.messages.map((m) => [m.role, m.content]), [['user', 'سلام'], ['ai', 'پاسخ'], ['user', 'ادامه']]);

  const list = await (await worker.fetch(req('/api/ai/threads', { cookie: cookies['الف'] }), env)).json();
  assert.equal(list.threads.length, 1);
});

test('گفت‌وگوی کاربر دیگر دیده یا تغییر داده نمی‌شود', { skip }, async () => {
  const { env, cookies } = await setup();
  const created = await (await worker.fetch(req('/api/ai/threads', { method: 'POST', body: {}, cookie: cookies['الف'] }), env)).json();
  const id = created.thread.id;
  assert.equal((await worker.fetch(req(`/api/ai/threads/${id}`, { cookie: cookies['ب'] }), env)).status, 404);
  assert.equal((await worker.fetch(req(`/api/ai/threads/${id}/messages`, { method: 'POST', body: { role: 'user', content: 'x' }, cookie: cookies['ب'] }), env)).status, 404);
  assert.equal((await worker.fetch(req(`/api/ai/threads/${id}`, { method: 'DELETE', cookie: cookies['ب'] }), env)).status, 404);
  const list = await (await worker.fetch(req('/api/ai/threads', { cookie: cookies['ب'] }), env)).json();
  assert.equal(list.threads.length, 0);
});

test('ورودی نامعتبر و شناسهٔ غیرعددی رد می‌شوند', { skip }, async () => {
  const { env, cookies } = await setup();
  const created = await (await worker.fetch(req('/api/ai/threads', { method: 'POST', body: {}, cookie: cookies['الف'] }), env)).json();
  const id = created.thread.id;
  const badRole = await worker.fetch(req(`/api/ai/threads/${id}/messages`, { method: 'POST', body: { role: 'admin', content: 'x' }, cookie: cookies['الف'] }), env);
  assert.equal(badRole.status, 422);
  const empty = await worker.fetch(req(`/api/ai/threads/${id}/messages`, { method: 'POST', body: { role: 'user', content: '   ' }, cookie: cookies['الف'] }), env);
  assert.equal(empty.status, 422);
  const badId = await worker.fetch(req('/api/ai/threads/1%20OR%201/messages', { cookie: cookies['الف'] }), env);
  assert.ok([404, 422].includes(badId.status));
});

test('حذف گفت‌وگو، پیام‌های آن را هم پاک می‌کند', { skip }, async () => {
  const { db, env, cookies } = await setup();
  const created = await (await worker.fetch(req('/api/ai/threads', { method: 'POST', body: {}, cookie: cookies['الف'] }), env)).json();
  const id = created.thread.id;
  await worker.fetch(req(`/api/ai/threads/${id}/messages`, { method: 'POST', body: { role: 'user', content: 'سلام' }, cookie: cookies['الف'] }), env);
  assert.equal((await worker.fetch(req(`/api/ai/threads/${id}`, { method: 'DELETE', cookie: cookies['الف'] }), env)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assistant_messages').get().n, 0);
  assert.equal((await worker.fetch(req(`/api/ai/threads/${id}`, { cookie: cookies['الف'] }), env)).status, 404);
});

test('هشدار استناد: شماره ماده یا رأی در پاسخ دستیار علامت می‌خورد، متن عادی نه', async () => {
  const { citationWarnings, CITATION_WARNING } = await import('../worker/src/ai/routes.js');
  assert.deepEqual(citationWarnings('بر اساس ماده ۱۲۳ قانون مدنی ...'), [CITATION_WARNING]);
  assert.deepEqual(citationWarnings('رأی شماره 1400 دادگاه'), [CITATION_WARNING]);
  assert.deepEqual(citationWarnings('قانون مدنی در این موضوع مرجع است و مهلت پاسخ مشخص است.'), []);
  assert.deepEqual(citationWarnings(''), []);
});
