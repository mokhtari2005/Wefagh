import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitForSpeech, concatWav, clampReply, SPEECH_CHUNK_CHARS } from '../worker/src/ai/speech.js';
import { makeWav } from './helpers/wav.js';

const dataOf = (wav) => {
  const v = new DataView(wav.buffer, wav.byteOffset);
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = String.fromCharCode(...wav.subarray(at, at + 4));
    const size = v.getUint32(at + 4, true);
    if (id === 'data') return wav.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  return null;
};

test('متن کوتاه تقسیم نمی‌شود و متن خالی هیچ تکه‌ای ندارد', () => {
  assert.deepEqual(splitForSpeech('سلام. حالتان چطور است؟'), ['سلام. حالتان چطور است؟']);
  assert.deepEqual(splitForSpeech('   '), []);
  assert.deepEqual(splitForSpeech(undefined), []);
});

test('متن بلند فارسی در مرز جمله تقسیم می‌شود و هیچ تکه‌ای از سقف بیشتر نیست', () => {
  const sentence = 'دادگاه محترم ادعای خواهان را با توجه به مستندات پرونده بررسی می‌کند.';
  const text = Array.from({ length: 60 }, () => sentence).join(' ');
  assert.ok(text.length > 3000);
  const parts = splitForSpeech(text, SPEECH_CHUNK_CHARS);
  assert.ok(parts.length >= 3);
  for (const p of parts) {
    assert.ok(p.length <= SPEECH_CHUNK_CHARS, `طول ${p.length}`);
    assert.ok(p.endsWith('.'), 'هر تکه در پایان جمله تمام می‌شود');
  }
  assert.equal(parts.join(' '), text, 'هیچ متنی گم یا تکرار نمی‌شود');
});

test('جملهٔ بلندتر از سقف در فاصله بریده می‌شود و باز هم متن گم نمی‌شود', () => {
  const words = Array.from({ length: 400 }, (_, i) => `کلمه${i}`);
  const text = words.join(' ');
  const parts = splitForSpeech(text, 200);
  assert.ok(parts.every((p) => p.length <= 200));
  assert.deepEqual(parts.join(' ').split(' '), words);
});

test('کلمهٔ بدون فاصله و بلندتر از سقف هم به تکه‌های مجاز بریده می‌شود', () => {
  const parts = splitForSpeech('ا'.repeat(450), 200);
  assert.deepEqual(parts.map((p) => p.length), [200, 200, 50]);
});

test('clampReply پاسخ را در مرز جمله کوتاه می‌کند و پاسخ کوتاه را دست نمی‌زند', () => {
  assert.equal(clampReply('  کوتاه  ', 100), 'کوتاه');
  const text = `${'جملهٔ اول است. '.repeat(10)}${'ب'.repeat(300)}`;
  const out = clampReply(text, 120);
  assert.ok(out.length <= 120);
  assert.ok(out.endsWith('.'));
});

test('concatWav دادهٔ چند WAV را به‌ترتیب و با هدر درست می‌چسباند', () => {
  const a = makeWav([1, 2, 3]);
  const b = makeWav([4, 5], { extraChunk: true });
  const c = makeWav([6]);
  const out = concatWav([a, b, c]);
  const dv = new DataView(out.buffer);
  assert.equal(String.fromCharCode(...out.subarray(0, 4)), 'RIFF');
  assert.equal(dv.getUint32(4, true), out.length - 8);
  assert.equal(dv.getUint32(24, true), 24000);
  const data = dataOf(out);
  const samples = Array.from({ length: data.length / 2 }, (_, i) => new DataView(data.buffer, data.byteOffset).getInt16(i * 2, true));
  assert.deepEqual(samples, [1, 2, 3, 4, 5, 6]);
});

test('concatWav با قالب‌های متفاوت یا فایل نامعتبر null می‌دهد', () => {
  assert.equal(concatWav([makeWav([1]), makeWav([2], { sampleRate: 16000 })]), null);
  assert.equal(concatWav([makeWav([1]), new Uint8Array([1, 2, 3])]), null);
  assert.equal(concatWav([]), null);
});
