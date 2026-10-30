// ابزارهای مشترک هوش مصنوعی در مرورگر: وضعیت سرویس، پیام‌های خطای فارسی، دریافت صوت، و آمادگی پخش در موبایل.
// کلید API هرگز در مرورگر نیست؛ همهٔ درخواست‌ها به /api/ai می‌روند.
import { getJson } from './api.js';

export const AI_ERROR_TEXT = Object.freeze({
  AI_NOT_CONFIGURED: 'سرویس هوش مصنوعی هنوز روی سرور فعال نشده است. تا آن زمان از حالت آموزشی قاعده‌محور استفاده کنید.',
  AI_KEY_REJECTED: 'اتصال به سرویس هوش مصنوعی برقرار نشد (تنظیمات سرور). لطفاً بعداً دوباره تلاش کنید.',
  AI_QUOTA: 'سهمیهٔ سرویس هوش مصنوعی موقتاً پر شده است. کمی بعد دوباره تلاش کنید.',
  AI_RATE_LIMITED: 'درخواست‌ها خیلی سریع ارسال شده‌اند. چند ثانیه صبر کنید و دوباره تلاش کنید.',
  AI_UNAVAILABLE: 'سرویس هوش مصنوعی در دسترس نیست یا پاسخ نداد. متن را ذخیره کنید و بعداً دوباره تلاش کنید.',
  AI_BLOCKED: 'این درخواست توسط سرویس پذیرفته نشد. متن را کوتاه یا مؤدبانه‌تر بنویسید.',
  AI_EMPTY: 'پاسخ کاملی دریافت نشد. دوباره تلاش کنید.',
  AI_REJECTED: 'درخواست توسط سرویس پذیرفته نشد.',
  UNAUTHENTICATED: 'برای استفاده از این بخش ابتدا وارد حساب خود شوید.',
  VALIDATION_FAILED: 'ورودی‌ها معتبر نیستند؛ متن را بررسی کنید.',
  PAYLOAD_TOO_LARGE: 'حجم ورودی بیش از حد مجاز است؛ متن یا فایل صوتی را کوتاه کنید.',
  NETWORK: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
});

export function errorText(code) {
  return AI_ERROR_TEXT[code] || 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.';
}

/** @returns {Promise<{configured: boolean}>} */
export async function aiStatus() {
  const res = await getJson('/api/ai/status');
  return { configured: Boolean(res.ok && res.data?.configured) };
}

/**
 * ارسال JSON و دریافت صوت (WAV) یا JSON خطا. Blob فقط وقتی برمی‌گردد که پاسخ واقعاً صوت باشد.
 * @returns {Promise<{ok: true, blob: Blob} | {ok: false, error: string}>}
 */
export async function postForBlob(path, payload, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav, application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.startsWith('audio/')) {
      const blob = await res.blob();
      return blob.size > 44 ? { ok: true, blob } : { ok: false, error: 'AI_EMPTY' };
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: false, error: data?.error || 'AI_UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

/** یک WAV بی‌صدای کوتاه؛ برای «باز کردن قفل» پخش صدا در مرورگرهای موبایل در لحظهٔ کلیک کاربر. */
export function silentWavBlob() {
  const sampleRate = 8000;
  const dataBytes = sampleRate / 10 * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buffer);
  const writeStr = (offset, s) => { for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  writeStr(36, 'data'); v.setUint32(40, dataBytes, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * پخش‌کنندهٔ واحد: فقط یک صدا همزمان؛ قبل از پخش جدید، صدای قبلی متوقف می‌شود.
 * unlock() باید مستقیماً در یک رویداد کلیک صدا زده شود تا پخش بعدی در موبایل مجاز باشد.
 */
export function createPlayer({ onEnded } = {}) {
  const audio = new Audio();
  audio.addEventListener('ended', () => onEnded?.());
  let currentUrl = null;
  let silentUrl = null;
  return {
    audio,
    unlock() {
      if (!silentUrl) silentUrl = URL.createObjectURL(silentWavBlob());
      audio.src = silentUrl;
      // pause پس از پایان play انجام می‌شود تا خطای قطع شدن پخش ایجاد نشود.
      audio.play().then(() => audio.pause()).catch(() => {});
    },
    /** @returns {Promise<{ok: boolean, error?: string}>} */
    async play(blob) {
      audio.pause();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(blob);
      audio.src = currentUrl;
      try {
        await audio.play();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.name === 'NotAllowedError' ? 'NOT_ALLOWED' : 'PLAY_FAILED' };
      }
    },
    stop() { audio.pause(); },
    /** حجم صدا بین ۰ و ۱. */
    setVolume(v) {
      const n = Math.min(1, Math.max(0, Number(v)));
      audio.volume = Number.isFinite(n) ? n : 1;
      return audio.volume;
    },
    /** سرعت پخش؛ بین ۰٫۵ تا ۲ مجاز است و زیر و بم صدا حفظ می‌شود. */
    setRate(rate) {
      const r = Math.min(2, Math.max(0.5, Number(rate) || 1));
      audio.playbackRate = r;
      audio.preservesPitch = true;
      return r;
    },
    dispose() {
      audio.pause();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      if (silentUrl) URL.revokeObjectURL(silentUrl);
      currentUrl = null;
      silentUrl = null;
    },
  };
}

/** @returns {Promise<string>} داده base64 بدون پیشوند data: */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** انتخاب قالب ضبط پشتیبانی‌شده توسط مرورگر (بدون codec اضافه، چون سرور همان نوع پایه را می‌خواهد). */
export function pickRecordingMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

export function baseMime(type) {
  return String(type || '').split(';')[0].trim();
}
