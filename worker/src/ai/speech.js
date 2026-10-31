// ابزارهای خالص برای صدا: تقسیم متن بلند در مرز جمله، الحاق WAVها و کوتاه‌کردن پاسخ مدل. بدون وابستگی به Worker.

export const SPEECH_CHUNK_CHARS = 900;

const SENTENCE_END = /(?<=[.!؟?؛\n])\s+/u;

function cutAtBoundary(text, max) {
  const head = text.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('؟ '), head.lastIndexOf('! '), head.lastIndexOf('؛ '), head.lastIndexOf('\n'));
  if (sentence > max * 0.4) return sentence + 1;
  const space = head.lastIndexOf(' ');
  return space > max * 0.4 ? space : max;
}

/** متن را به تکه‌هایی با حداکثر `max` نویسه تقسیم می‌کند؛ ترجیحاً در پایان جمله، سپس در فاصله. */
export function splitForSpeech(text, max = SPEECH_CHUNK_CHARS) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const parts = [];
  let current = '';
  const push = () => { if (current.trim()) parts.push(current.trim()); current = ''; };
  for (const sentence of clean.split(SENTENCE_END)) {
    let rest = sentence;
    while (rest.length > max) {
      push();
      const at = cutAtBoundary(rest, max);
      parts.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (current && current.length + 1 + rest.length > max) push();
    current = current ? `${current} ${rest}` : rest;
  }
  push();
  return parts.filter(Boolean);
}

/** پاسخ مدل را در مرز جمله به `max` نویسه می‌رساند تا از سقف‌های بعدی (تاریخچه، صدا) عبور نکند. */
export function clampReply(text, max) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, cutAtBoundary(clean, max)).trim();
}

const ascii = (bytes, at, len) => String.fromCharCode(...bytes.subarray(at, at + len));

function parseWav(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ') fmt = bytes.subarray(start, Math.min(start + size, bytes.length));
    if (id === 'data') {
      // اندازهٔ صفر یا بیش از حد (WAV استریم‌شده) یعنی داده تا انتهای فایل ادامه دارد.
      const length = size === 0 || start + size > bytes.length ? bytes.length - start : size;
      return fmt ? { fmt, data: bytes.subarray(start, start + length) } : null;
    }
    offset = start + size + (size % 2);
  }
  return null;
}

/** چند WAV هم‌قالب را پشت هم می‌چسباند. اگر هرکدام نامعتبر یا قالب‌ها متفاوت باشند null برمی‌گرداند. */
export function concatWav(buffers) {
  const parsed = buffers.map(parseWav);
  if (!parsed.length || parsed.some((p) => !p)) return null;
  const [first] = parsed;
  if (parsed.some((p) => p.fmt.length !== first.fmt.length || p.fmt.some((b, i) => b !== first.fmt[i]))) return null;
  const dataLength = parsed.reduce((n, p) => n + p.data.length, 0);
  const fmtPad = first.fmt.length % 2;
  const out = new Uint8Array(12 + 8 + first.fmt.length + fmtPad + 8 + dataLength);
  const view = new DataView(out.buffer);
  const write = (at, text) => { for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i); };
  write(0, 'RIFF');
  view.setUint32(4, out.length - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, first.fmt.length, true);
  out.set(first.fmt, 20);
  const dataAt = 20 + first.fmt.length + fmtPad;
  write(dataAt, 'data');
  view.setUint32(dataAt + 4, dataLength, true);
  let at = dataAt + 8;
  for (const p of parsed) { out.set(p.data, at); at += p.data.length; }
  return out;
}
