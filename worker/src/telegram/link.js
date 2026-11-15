// اتصال حساب وفاق به گفت‌وگوی تلگرام با کد یک‌بارمصرف. فقط هش کد در دیتابیس می‌ماند.
import { hashToken } from '../auth/token.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون نویسه‌های مشابه (O/0، I/1)
const CODE_LENGTH = 8;
export const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODES_PER_WINDOW = 5;

export function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(text) {
  return String(text ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
}

export async function createLinkCode(env, userId, now = new Date()) {
  const since = new Date(now.getTime() - CODE_TTL_MS).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM telegram_link_codes WHERE user_id = ?1 AND created_at > ?2')
    .bind(userId, since).first();
  if ((recent?.n ?? 0) >= MAX_CODES_PER_WINDOW) return { ok: false, error: 'TOO_MANY_CODES' };
  // کدهای قبلی باطل می‌شوند (حذف نمی‌شوند تا شمارش سقف ساخت کد درست بماند)؛ ردیف‌های قدیمی‌تر از یک روز پاک می‌شوند.
  const nowIso = now.toISOString();
  await env.DB.prepare('UPDATE telegram_link_codes SET used_at = ?1 WHERE user_id = ?2 AND used_at IS NULL').bind(nowIso, userId).run();
  await env.DB.prepare('DELETE FROM telegram_link_codes WHERE created_at < ?1')
    .bind(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()).run();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  await env.DB.prepare('INSERT INTO telegram_link_codes (code_hash, user_id, expires_at) VALUES (?1, ?2, ?3)')
    .bind(await hashToken(code), userId, expiresAt).run();
  return { ok: true, code, expiresAt };
}

/** @returns {{ok:true}|{ok:false,error:'INVALID_CODE'}} */
export async function redeemLinkCode(env, chatId, rawCode, now = new Date()) {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) return { ok: false, error: 'INVALID_CODE' };
  const hash = await hashToken(code);
  const row = await env.DB.prepare('SELECT user_id FROM telegram_link_codes WHERE code_hash = ?1 AND used_at IS NULL AND expires_at > ?2')
    .bind(hash, now.toISOString()).first();
  if (!row) return { ok: false, error: 'INVALID_CODE' };
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telegram_links WHERE chat_id = ?1 OR user_id = ?2').bind(chatId, row.user_id),
    env.DB.prepare('INSERT INTO telegram_links (user_id, chat_id) VALUES (?1, ?2)').bind(row.user_id, chatId),
    env.DB.prepare('UPDATE telegram_link_codes SET used_at = ?1 WHERE code_hash = ?2').bind(now.toISOString(), hash),
  ]);
  return { ok: true };
}

export async function linkedUserId(env, chatId) {
  const row = await env.DB.prepare('SELECT user_id FROM telegram_links WHERE chat_id = ?1').bind(chatId).first();
  return row?.user_id ?? null;
}

export async function unlinkChat(env, chatId) {
  await env.DB.prepare('DELETE FROM telegram_links WHERE chat_id = ?1').bind(chatId).run();
}

export async function unlinkUser(env, userId) {
  await env.DB.prepare('DELETE FROM telegram_links WHERE user_id = ?1').bind(userId).run();
}

export async function linkStatus(env, userId) {
  const row = await env.DB.prepare('SELECT linked_at FROM telegram_links WHERE user_id = ?1').bind(userId).first();
  return { linked: !!row, linkedAt: row?.linked_at ?? null };
}
