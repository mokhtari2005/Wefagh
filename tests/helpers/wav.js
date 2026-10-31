// ساخت WAV واقعی (مونو، ۱۶بیتی) برای آزمون‌های صدا.
/** WAV واقعی مونو ۱۶بیتی ۲۴کیلوهرتز با دادهٔ مشخص. */
export function makeWav(samples, { sampleRate = 24000, extraChunk = false } = {}) {
  const data = new Uint8Array(samples.length * 2);
  const dv = new DataView(data.buffer);
  samples.forEach((s, i) => dv.setInt16(i * 2, s, true));
  const list = extraChunk ? new Uint8Array([76, 73, 83, 84, 4, 0, 0, 0, 1, 2, 3, 4]) : new Uint8Array(0);
  const out = new Uint8Array(44 + list.length + data.length);
  const v = new DataView(out.buffer);
  const w = (at, t) => { for (let i = 0; i < t.length; i++) out[at + i] = t.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, out.length - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  out.set(list, 36);
  w(36 + list.length, 'data'); v.setUint32(40 + list.length, data.length, true);
  out.set(data, 44 + list.length);
  return out;
}
