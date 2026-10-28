import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../worker/src/index.js';
import { hashToken } from '../worker/src/auth/token.js';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
const skip = !DatabaseSync && 'node:sqlite در دسترس نیست';
const here = dirname(fileURLToPath(import.meta.url));
const migration = (name) => readFileSync(join(here, '..', 'worker', 'migrations', name), 'utf8');
function d1Like(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
      return {
        all: async (...args) => ({ success: true, results: stmt.all(...args) }),
        first: async (...args) => stmt.get(...args) ?? null,
        bind(...args) {
          return {
            first: async () => stmt.get(...args) ?? null,
            all: async () => ({ success: true, results: stmt.all(...args) }),
            run: async () => { stmt.run(...args); return { success: true, results: [] }; },
          };
        },
      };
    },
  };
}

async function setup() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON;');
  for (const file of ['0001_init.sql', '0002_auth.sql', '0003_academy.sql', '0004_deadlines.sql', '0005_casework.sql', '0006_admin_content.sql']) db.exec(migration(file));
  const user = db.prepare("INSERT INTO users (email,password_hash,display_name,email_verified_at) VALUES ('dash@example.com','h','دانشجو','2026-01-01T00:00:00Z') RETURNING id").get();
  const token = 'dashboard-session-token-123456';
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(await hashToken(token), user.id, '2099-01-01T00:00:00.000Z');
  return { db, env: { DB: d1Like(db) }, cookie: `wefagh_session=${token}`, userId: user.id };
}
function req(path, cookie) { return new Request(`https://wefagh.ir${path}`, { headers: cookie ? { cookie } : {} }); }

test('داشبورد بدون ورود دادهٔ خصوصی را برنمی‌گرداند', { skip }, async () => {
  const { env } = await setup();
  const res = await worker.fetch(req('/api/dashboard/summary'), env);
  assert.equal(res.status, 401);
});

test('داشبورد خلاصهٔ دوره، تمرین و موعدهای خود کاربر را ارائه می‌کند', { skip }, async () => {
  const { db, env, cookie, userId } = await setup();
  db.prepare('INSERT INTO enrollments (user_id,course_id) VALUES (?,?)').run(userId, 'civil-basics');
  db.prepare('INSERT INTO lesson_progress (user_id,course_id,lesson_id) VALUES (?,?,?)').run(userId, 'civil-basics', 'l1');
  db.prepare("INSERT INTO moot_sessions (user_id,case_id,title,answers_json,rubric_json,stage,score) VALUES (?,?,?,?,?,?,?)").run(userId, 'delivery-delay', 'تمرین نمونه', '{}', '[true]', 'result', 80);
  db.prepare("INSERT INTO deadlines (user_id,title,due_date,kind) VALUES (?,?,?,?)").run(userId, 'موعد آینده', new Date(Date.now() + 86400000).toISOString().slice(0, 10), 'filing');
  const res = await worker.fetch(req('/api/dashboard/summary', cookie), env);
  assert.equal(res.status, 200);
  const { summary } = await res.json();
  assert.equal(summary.enrolledCourseCount, 1);
  assert.equal(summary.completedLessonCount, 1);
  assert.equal(summary.courses[0].percent, 33);
  assert.equal(summary.mootSessionCount, 1);
  assert.equal(summary.averageScore, 80);
  assert.equal(summary.upcomingDeadlines[0].title, 'موعد آینده');
});

test('داشبورد فقط مسیر GET را می‌پذیرد', { skip }, async () => {
  const { env, cookie } = await setup();
  const res = await worker.fetch(new Request('https://wefagh.ir/api/dashboard/summary', { method: 'POST', headers: { cookie } }), env);
  assert.equal(res.status, 405);
});
