// Encrypted, scheduled D1 snapshots in a dedicated private B2 prefix.
import { b2PutObject, b2ListObjects, b2DeleteObject } from './b2-s3.js';
import { json } from './http.js';
import { requireMailAdmin } from './admin-mail.js';

const PREFIX = 'system-backups/d1/';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_ROWS = 100_000;
const MAX_TABLES = 500;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
function backupError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function jsonReplacer(_key, value) {
  if (value instanceof ArrayBuffer) {
    return { __backupBinary: true, base64: encodeBase64(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    return { __backupBinary: true, base64: encodeBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  }
  return value;
}

export function isBackupExpired(lastModified, now = Date.now()) {
  const timestamp = Date.parse(lastModified || '');
  return Number.isFinite(timestamp) && now - timestamp >= RETENTION_MS;
}

async function encryptBackup(plainBytes, secret) {
  if (typeof secret !== 'string' || !secret.trim()) throw backupError('BACKUP_ENCRYPTION_KEY_MISSING');
  let raw;
  try { raw = decodeBase64(secret.trim()); } catch { throw backupError('BACKUP_ENCRYPTION_KEY_INVALID'); }
  if (raw.byteLength !== 32) throw backupError('BACKUP_ENCRYPTION_KEY_INVALID');
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  return encoder.encode(JSON.stringify({
    version: 1,
    algorithm: 'AES-256-GCM',
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
  }));
}

async function exportDatabase(db) {
  const schemaResult = await db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  const schema = schemaResult?.results || [];
  if (!schema.length || schema.length > MAX_TABLES) throw backupError('BACKUP_SCHEMA_INVALID');

  const tables = [];
  let totalRows = 0;
  for (const table of schema) {
    const name = String(table.name || '');
    if (!name || name.includes('\u0000')) throw backupError('BACKUP_TABLE_NAME_INVALID');
    const quoted = '"' + name.replace(/"/g, '""') + '"';
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await db.prepare(`SELECT * FROM ${quoted} LIMIT ?1 OFFSET ?2`)
        .bind(PAGE_SIZE, offset).all();
      const batch = page?.results || [];
      rows.push(...batch);
      totalRows += batch.length;
      if (totalRows > MAX_ROWS) throw backupError('BACKUP_ROW_LIMIT_EXCEEDED');
      if (batch.length < PAGE_SIZE) break;
    }
    tables.push({ name, sql: table.sql || null, rows });
  }
  return { format: 'mokhtari-d1-logical-backup', version: 1, createdAt: new Date().toISOString(), tableCount: tables.length, rowCount: totalRows, tables };
}

async function pruneExpired(env, now = Date.now()) {
  const objects = await b2ListObjects(env, PREFIX);
  let deleted = 0;
  for (const object of objects) {
    if (object.key && isBackupExpired(object.lastModified, now)) {
      await b2DeleteObject(env, object.key);
      deleted++;
    }
  }
  return deleted;
}

export async function runScheduledBackup(env, now = new Date()) {
  if (!env.DB) throw backupError('BACKUP_DATABASE_NOT_CONFIGURED');
  if (!env.B2_ENDPOINT || !env.B2_BUCKET || !env.B2_KEY_ID || !env.B2_APPLICATION_KEY) {
    throw backupError('BACKUP_STORAGE_NOT_CONFIGURED');
  }
  if (!env.BACKUP_ENCRYPTION_KEY) throw backupError('BACKUP_ENCRYPTION_KEY_MISSING');

  // A D1 session keeps sequential reads on the same consistency chain when supported.
  const db = typeof env.DB.withSession === 'function' ? env.DB.withSession('first-primary') : env.DB;
  const snapshot = await exportDatabase(db);
  const plain = encoder.encode(JSON.stringify(snapshot, jsonReplacer));
  if (plain.byteLength > MAX_BACKUP_BYTES) throw backupError('BACKUP_SIZE_LIMIT_EXCEEDED');
  const encrypted = await encryptBackup(plain, env.BACKUP_ENCRYPTION_KEY);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const key = PREFIX + stamp + '.json.enc';

  // Upload first; retention cleanup runs only after the new encrypted copy exists.
  await b2PutObject(env, key, encrypted, 'application/octet-stream');
  const deleted = await pruneExpired(env, now.getTime());
  return { ok: true, key, bytes: encrypted.byteLength, tables: snapshot.tableCount, rows: snapshot.rowCount, deleted };
}

export async function handleBackupStatus(request, env, path) {
  if (path !== '/api/admin/backups/status') return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;
  const missing = [
    ...(!env.DB ? ['D1 binding'] : []),
    ...(!(env.B2_ENDPOINT && env.B2_BUCKET && env.B2_KEY_ID && env.B2_APPLICATION_KEY) ? ['B2 storage credentials'] : []),
    ...(!env.BACKUP_ENCRYPTION_KEY ? ['BACKUP_ENCRYPTION_KEY (32-byte base64 secret)'] : []),
  ];
  if (missing.length) return json({ ok: true, configured: false, missing, snapshots: [] });
  try {
    const objects = await b2ListObjects(env, PREFIX);
    const snapshots = objects
      .filter((item) => item.key && item.lastModified)
      .sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified))
      .slice(0, 8)
      .map((item) => ({ createdAt: item.lastModified, size: item.size, expiresAt: new Date(Date.parse(item.lastModified) + RETENTION_MS).toISOString() }));
    return json({ ok: true, configured: true, retentionHours: 24, intervalHours: 6, snapshots });
  } catch (error) {
    console.error(JSON.stringify({ where: 'backups.status', code: error?.code || error?.name || 'Error' }));
    return json({ ok: false, error: 'BACKUP_STATUS_FAILED' }, 502);
  }
}
