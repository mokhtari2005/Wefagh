import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACH_ACCEPT, ATTACH_LIMITS, ATTACH_TYPES, ATTACH_PRIVACY_NOTE, DOC_TYPES, MODES, checkNewFile, fileExt, formatSize,
} from '../site/js/assistant.js';
import { ASSISTANT_DOC_TYPES, ASSISTANT_MODES } from '../worker/src/ai/prompts.js';
import { SUPPORTED_EXTENSIONS, ATTACHMENT_LIMITS } from '../worker/src/ai/attachments.js';
import { AI_ERROR_TEXT } from '../site/js/ai-client.js';

const f = (name, size) => ({ name, size });

test('حدها و پسوندهای واجد شرایط واجهه دقیقاً با سرور یکی است', () => {
  assert.deepEqual(Object.keys(ATTACH_TYPES).sort(), [...SUPPORTED_EXTENSIONS].sort());
  assert.equal(ATTACH_LIMITS.files, ATTACHMENT_LIMITS.files);
  assert.equal(ATTACH_LIMITS.fileBytes, ATTACHMENT_LIMITS.fileBytes);
  assert.equal(ATTACH_LIMITS.textFileBytes, ATTACHMENT_LIMITS.textFileBytes);
  assert.equal(ATTACH_LIMITS.totalBytes, ATTACHMENT_LIMITS.totalBytes);
  for (const ext of SUPPORTED_EXTENSIONS) assert.ok(ATTACH_ACCEPT.includes(`.${ext}`), ext);
});

test('نوع‌های سند و حالت‌های واجهه همه در سرور معتبرند (هیچ مقداری رد نمی‌شود)', () => {
  for (const [value] of DOC_TYPES) assert.ok(Object.hasOwn(ASSISTANT_DOC_TYPES, value), value);
  assert.ok(DOC_TYPES.some(([v]) => v === 'other'), 'گزینهٔ «سایر اسناد» موجود باشد');
  assert.deepEqual(MODES.map(([v]) => v), [...ASSISTANT_MODES]);
});

test('checkNewFile: پسوند، خالی، حجم، تعداد و مجموع', () => {
  assert.deepEqual(checkNewFile(f('a.pdf', 1000), []), { ok: true, label: 'PDF' });
  assert.deepEqual(checkNewFile(f('b.DOCX', 1000), []), { ok: true, label: 'Word' });
  assert.deepEqual(checkNewFile(f('c.jpeg', 1000), []), { ok: true, label: 'تصویر' });
  assert.equal(checkNewFile(f('x.exe', 10), []).code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(checkNewFile(f('noext', 10), []).code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(checkNewFile(f('a.pdf', 0), []).code, 'FILE_EMPTY');
  assert.equal(checkNewFile(f('a.pdf', ATTACH_LIMITS.fileBytes + 1), []).code, 'FILE_TOO_LARGE');
  assert.equal(checkNewFile(f('a.txt', ATTACH_LIMITS.textFileBytes + 1), []).code, 'FILE_TOO_LARGE');
  const three = [1, 2, 3].map((i) => ({ file: f(`${i}.pdf`, 100) }));
  assert.equal(checkNewFile(f('4.pdf', 100), three).code, 'TOO_MANY_FILES');
  const big = [{ file: f('a.pdf', 7 * 1024 * 1024) }, { file: f('b.pdf', 4 * 1024 * 1024) }];
  assert.equal(checkNewFile(f('c.pdf', 2 * 1024 * 1024), big).code, 'FILE_TOO_LARGE', 'مجموع بیش از ۱۲ مگابایت');
});

test('همهٔ کدهای خطای پیوست متن فارسی دارند و هشدار محرمانگی به Gemini و حذف هویت اشاره می‌کند', () => {
  for (const code of ['UNSUPPORTED_FILE_TYPE', 'FILE_TOO_LARGE', 'FILE_CORRUPT', 'FILE_EMPTY', 'PDF_ENCRYPTED', 'TOO_MANY_FILES']) {
    assert.ok(AI_ERROR_TEXT[code]?.length > 10, code);
  }
  assert.match(ATTACH_PRIVACY_NOTE, /Gemini/);
  assert.match(ATTACH_PRIVACY_NOTE, /هویتی/);
});

test('fileExt و formatSize', () => {
  assert.equal(fileExt('حکم.نهایی.PDF'), 'pdf');
  assert.equal(fileExt('x'), '');
  assert.equal(formatSize(2048), `${(2).toLocaleString('fa-IR')} کیلوبایت`);
  assert.match(formatSize(3 * 1024 * 1024), /مگابایت/);
});
