// سرور محلی آزمایشی: فایل‌های سایت + API واقعی Worker روی SQLite موقت با migrationهای واقعی.
// فقط برای آزمون محلی. کاربران آزمایشی داخل حافظهٔ همین فرایند ساخته می‌شوند و هیچ اتصالی به دیتابیس عملیاتی ندارند.
// اجرا: PORT=8092 node scripts/local-dev/devserver.mjs
// فقط برای آزمون محلی؛ وابسته به محیط Cloudflare نیست و به شبکه یا دیتابیس عملیاتی وصل نمی‌شود.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const SITE = join(REPO, 'site');
const MIG = join(REPO, 'worker', 'migrations');
const { default: worker } = await import(join(REPO, 'worker/src/index.js'));

const db = new DatabaseSync(':memory:');
// MAX_MIGRATION=0004 یعنی فقط migrationهای تا ۰۰۰۴ اجرا شوند (برای بازتولید خطای دیتابیس ناقص).
const maxMig = process.env.MAX_MIGRATION || '9999';
const files = (await import('node:fs')).readdirSync(MIG).filter((f) => f.endsWith('.sql') && f.slice(0, 4) <= maxMig).sort();
const migrationLog = [];
for (const f of files) {
  try {
    db.exec(readFileSync(join(MIG, f), 'utf8'));
    migrationLog.push(`OK ${f}`);
  } catch (e) {
    migrationLog.push(`FAIL ${f}: ${e.message}`);
  }
}
console.log(migrationLog.join('\n'));
// کاربر آزمایشی فقط در همین سرور محلی (حافظهٔ موقت) ساخته می‌شود؛ هیچ داده‌ای به دیتابیس واقعی نمی‌رود.
const { hashPassword } = await import(join(REPO, 'worker/src/auth/password.js'));
db.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?1, ?2, ?3, datetime('now'))").run('tester@example.test', await hashPassword('رمز-آزمایشی-۱۴۰۵'), 'کاربر آزمایشی');
db.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?1, ?2, ?3, datetime('now'))").run('manager@example.test', await hashPassword('رمز-مدیر-آزمایشی-۱۴۰۵'), 'مدیر آزمایشی');
db.prepare("INSERT INTO user_roles (user_id, role) VALUES ((SELECT id FROM users WHERE email='manager@example.test'), 'academy_manager')").run();
console.log('test user and academy manager seeded (local only)');

function d1Like(conn) {
  return {
    prepare(sql) {
      const stmt = conn.prepare(sql.replace(/\?\d+/g, '?'));
      const wrap = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ success: true, results: stmt.all(...args) }),
        run: async () => { const info = stmt.run(...args); return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }; },
      });
      return { bind: (...args) => wrap(args), ...wrap([]) };
    },
    async batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
    async exec(sql) { conn.exec(sql); },
  };
}
const env = { DB: d1Like(db), PUBLIC_BASE_URL: 'http://localhost:' + (process.env.PORT || 8092), ADMIN_EMAIL: 'admin@example.test' };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

// همان سرآیندهای امنیتی فایل site/_headers را اعمال می‌کند تا آزمون مرورگر با تنظیمات واقعی انجام شود.
function securityHeaders() {
  const out = {};
  const lines = readFileSync(join(SITE, '_headers'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8092');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    try {
      const r = await worker.fetch(new Request(url.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, {});
      const out = {};
      r.headers.forEach((v, k) => { out[k] = v; });
      res.writeHead(r.status, out);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error('API error', url.pathname, e?.message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'DEV_SERVER_ERROR' }));
    }
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^\.+/, '');
  if (p === '/' || p === '') p = '/index.html';
  let file = join(SITE, p);
  if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', ...securityHeaders() });
  createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT || 8092), () => console.log('dev server on', process.env.PORT || 8092));
