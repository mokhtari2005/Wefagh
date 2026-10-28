// تست یکپارچگی: مهاجرت SQL واقعی روی SQLite داخلی Node و ذخیرهٔ پیام تماس.
// node:sqlite در Node 22 در دسترس است؛ یک لایهٔ کوچک، واسط D1 را شبیه‌سازی می‌کند.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(here, '..', 'worker', 'migrations', '0001_init.sql'), 'utf8');

let DatabaseSync;
let sqliteAvailable = true;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  sqliteAvailable = false;
}

function d1Like(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
      return {
        bind(...args) {
          return {
            run: async () => {
              const rows = stmt.all(...args);
              return { success: true, results: rows };
            },
          };
        },
      };
    },
  };
}

test('مهاجرت روی SQLite اجرا می‌شود و جدول ساخته می‌شود', { skip: !sqliteAvailable && 'node:sqlite در دسترس نیست' }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migrationSql);
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_messages'").get();
  assert.equal(row?.name, 'contact_messages');
});

test('ذخیرهٔ پیام تماس با saveContactMessage شناسه برمی‌گرداند', { skip: !sqliteAvailable && 'node:sqlite در دسترس نیست' }, async () => {
  const { saveContactMessage } = await import('../worker/src/contact.js');
  const db = new DatabaseSync(':memory:');
  db.exec(migrationSql);

  const { id } = await saveContactMessage(d1Like(db), {
    name: 'نیلوفر کریمی',
    email: 'niloofar@example.com',
    topic: 'media',
    message: 'آیا پادکست شنبه‌ها با وِفاق زیرنویس دارد؟',
  });
  assert.equal(typeof id, 'number');
  const stored = db.prepare('SELECT name, status FROM contact_messages WHERE id = ?').get(id);
  assert.equal(stored.name, 'نیلوفر کریمی');
  assert.equal(stored.status, 'new');
});

test('قیدهای دیتابیس ورودی بد را حتی بدون اعتبارسنجی Worker رد می‌کنند', { skip: !sqliteAvailable && 'node:sqlite در دسترس نیست' }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migrationSql);
  assert.throws(() =>
    db.prepare('INSERT INTO contact_messages (name, email, topic, message) VALUES (?,?,?,?)').run('ا', 'x@y.zz', 'general', 'کوتاه')
  );
  assert.throws(() =>
    db.prepare("INSERT INTO contact_messages (name, email, topic, message, status) VALUES (?,?,?,?,?)").run('علی', 'a@b.cc', 'general', 'متن کافی است برای تست', 'hacked')
  );
});
