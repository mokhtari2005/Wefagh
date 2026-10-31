// بارگذاری بانک پرونده‌ها به‌صورت پیش‌نویس: شمارش، تکرارناپذیری، یکپارچگی و دسترسی.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';
import { BANK_CASES } from '../worker/src/moot/bank/index.js';

let DatabaseSync;
let sqliteAvailable = true;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { sqliteAvailable = false; }
const skip = !sqliteAvailable && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (f) => readFileSync(join(here, '..', 'worker', 'migrations', f), 'utf8');

function d1Like(db) {
  const run = (sql, args) => {
    const compiled = sql.replace(/\?\d+/g, '?');
    return {
      first: async () => db.prepare(compiled).get(...args) ?? null,
      all: async () => ({ success: true, results: db.prepare(compiled).all(...args) }),
      run: async () => { db.prepare(compiled).run(...args); return { success: true, results: [] }; },
    };
  };
  return {
    prepare: (sql) => ({ ...run(sql, []), bind: (...args) => run(sql, args) }),
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}

async function setup({ roles = ['academy_manager'] } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of ['0001_init.sql', '0002_auth.sql', '0003_academy.sql', '0006_admin_content.sql']) db.exec(migration(f));
  const u = db.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ('m@example.com','h','مدیر','2026-01-01T00:00:00Z') RETURNING id").get();
  for (const r of roles) db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?,?)').run(u.id, r);
  const token = 'case-import-token-123456789';
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(await hashToken(token), u.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: d1Like(db) }, cookie: `wefagh_session=${token}` };
}

const req = (path, { method = 'GET', cookie } = {}) => new Request(`https://wefagh.ir${path}`, { method, headers: cookie ? { cookie } : {} });

test('بانک ۲۰۷ پرونده دارد و شناسه‌ها یکتاست', () => {
  assert.equal(BANK_CASES.length, 207);
  assert.equal(new Set(BANK_CASES.map((c) => c.id)).size, 207);
});

test('بدون ورود بارگذاری ۴۰۱ و کاربر عادی ۴۰۳ می‌گیرد', { skip }, async () => {
  const anon = await setup();
  assert.equal((await worker.fetch(req('/api/admin/cases/import', { method: 'POST' }), anon.env)).status, 401);
  const user = await setup({ roles: [] });
  assert.equal((await worker.fetch(req('/api/admin/cases/import', { method: 'POST', cookie: user.cookie }), user.env)).status, 403);
});

test('بارگذاری: آزمایشی بدون نوشتن، سپس ۲۰۷ پیش‌نویس؛ تکرار چیزی اضافه نمی‌کند', { skip }, async () => {
  const { db, env, cookie } = await setup();
  const dry = await (await worker.fetch(req('/api/admin/cases/import?dryRun=1', { method: 'POST', cookie }), env)).json();
  assert.equal(dry.wouldInsert, 207);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_content WHERE kind='case'").get().n, 0);

  const first = await (await worker.fetch(req('/api/admin/cases/import', { method: 'POST', cookie }), env)).json();
  assert.equal(first.inserted, 207);
  const again = await (await worker.fetch(req('/api/admin/cases/import', { method: 'POST', cookie }), env)).json();
  assert.equal(again.inserted, 0);
  assert.equal(again.skippedExisting, 207);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_content WHERE kind='case'").get().n, 207);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_content WHERE kind='case' AND status<>'draft'").get().n, 0);
});

test('گزارش یکپارچگی: همهٔ پرونده‌ها سالم، هیچ استنادی تأیید نشده و هیچ پروندهٔ منتشرشده‌ای نیست', { skip }, async () => {
  const { env, cookie } = await setup();
  await worker.fetch(req('/api/admin/cases/import', { method: 'POST', cookie }), env);
  const s = await (await worker.fetch(req('/api/admin/cases/status', { cookie }), env)).json();
  assert.equal(s.bankTotal, 207);
  assert.equal(s.dbTotal, 207);
  assert.equal(s.intact, 207);
  assert.deepEqual(s.missing, []);
  assert.deepEqual(s.changed, []);
  assert.equal(s.verifiedRefs, 0);
  assert.equal(s.counts.published, 0);
});

test('پیش‌نویس‌ها در فهرست عمومی پرونده‌ها دیده نمی‌شوند', { skip }, async () => {
  const { env, cookie } = await setup();
  await worker.fetch(req('/api/admin/cases/import', { method: 'POST', cookie }), env);
  const pub = await (await worker.fetch(req('/api/cases'), env)).json();
  assert.deepEqual(pub.cases, []);
});
