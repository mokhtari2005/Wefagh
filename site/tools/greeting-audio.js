// ابزار موقت: یک بار متن خوشامدگویی را به /api/ai/speech می‌فرستد و فایل صوتی را برای ذخیره در پروژه دانلود می‌کند.
import { VOICE_GREETING_TEXT } from '../js/voice-greeting.js';

const text = document.getElementById('text');
const button = document.getElementById('generate');
const status = document.getElementById('status');
const preview = document.getElementById('preview');
const download = document.getElementById('download');
text.textContent = VOICE_GREETING_TEXT;

button.addEventListener('click', async () => {
  button.disabled = true;
  status.className = 'form-status';
  status.textContent = 'در حال تولید صدا…';
  try {
    const res = await fetch('/api/ai/speech', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
      body: JSON.stringify({ text: VOICE_GREETING_TEXT, voice: 'Kore' }),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('audio/')) {
      // کد خطای سرور (مثلاً UNAUTHENTICATED یا AI_RATE_LIMITED) را از بدنهٔ JSON می‌خوانیم تا علت واقعی دیده شود.
      const data = type.includes('json') ? await res.json().catch(() => null) : null;
      const code = data?.error ? ` · کد خطا: ${data.error}` : '';
      status.className = 'form-status err';
      status.textContent = `تولید صدا انجام نشد (HTTP ${res.status}${code}).${res.status === 401 ? ' ابتدا با حساب کاربری وارد شوید.' : ''}`;
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    preview.src = url;
    download.href = url;
    download.hidden = false;
    status.className = 'form-status ok';
    status.textContent = `فایل ساخته شد (${Math.round(blob.size / 1024)} کیلوبایت، ${type}). فایل را دانلود و برای من بفرستید.`;
  } catch {
    status.className = 'form-status err';
    status.textContent = 'ارتباط با سرور برقرار نشد.';
  } finally {
    button.disabled = false;
  }
});
