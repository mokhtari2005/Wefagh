// آداپتر کوچک D1 روی SQLite واقعی (node:sqlite) برای آزمون مهاجرت‌ها و مسیرهای Worker.
// فقط همان بخش از API مربوط به D1 را پیاده می‌کند که کد پروژه استفاده می‌کند.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../worker/migrations');

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args), success: true }; }
  async run() { const info = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }; }
}

export function createTestDb({ migrate = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  if (migrate) {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  }
  return {
    raw: db,
    prepare(sql) { return new Statement(db, sql); },
    async batch(statements) { return Promise.all(statements.map((s) => s.run())); },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}
