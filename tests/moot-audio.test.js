import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../site/js/moot.js', import.meta.url), 'utf8');

test('موت‌کورت رابط ضبط و پخش صدای محلی دارد و برای مرورگر ناسازگار پیام می‌دهد', () => {
  assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(source, /new MediaRecorder/);
  assert.match(source, /audioPlayer\.src = audioUrl/);
  assert.match(source, /createObjectURL\(blob\)/);
  assert.match(source, /مرورگر یا محیط فعلی از ضبط صدا پشتیبانی نمی‌کند/);
});

test('ضبط صدا محدودیت پنج دقیقه دارد و صریحاً بارگذاری‌نشدن آن را اعلام می‌کند', () => {
  assert.match(source, /5 \* 60 \* 1000/);
  assert.match(source, /صدا را بارگذاری یا در حساب ذخیره نمی‌کند/);
});
