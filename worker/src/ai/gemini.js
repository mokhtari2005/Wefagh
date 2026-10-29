// کلاینت Gemini برای Worker. کلید فقط از Secret محیطی GEMINI_API_KEY خوانده می‌شود و فقط در هدر x-goog-api-key می‌رود.
// هیچ بدنهٔ درخواست یا پاسخ، متن پرونده یا کلید در لاگ یا پیام خطا نوشته نمی‌شود.

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
export const AI_TIMEOUT_MS = 25000;

// شناسه‌های مدل از متغیرهای [vars] خوانده می‌شوند تا بدون تغییر کد قابل تعویض باشند.
export function modelIds(env) {
  return {
    text: env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
    tts: env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
  };
}

export function aiConfigured(env) {
  return typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim().length >= 10;
}

/** خطای امن برای پاسخ HTTP: کد ثابت و وضعیت، بدون جزئیات فنی یا داده. */
export class AiError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

async function post(env, url, payload) {
  if (!aiConfigured(env)) throw new AiError('AI_NOT_CONFIGURED', 503);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY.trim() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch {
    throw new AiError('AI_UNAVAILABLE', 503);
  }
  if (res.status === 429) throw new AiError('AI_QUOTA', 429);
  if (res.status === 401 || res.status === 403) throw new AiError('AI_KEY_REJECTED', 503);
  if (res.status >= 500) throw new AiError('AI_UNAVAILABLE', 503);
  if (!res.ok) throw new AiError('AI_REJECTED', 502);
  try {
    return await res.json();
  } catch {
    throw new AiError('AI_UNAVAILABLE', 503);
  }
}

/** متن پاسخ مدل. اگر محتوا بلاک شده یا خالی باشد خطای مشخص برمی‌گرداند. */
export function extractText(data) {
  if (data?.promptFeedback?.blockReason) throw new AiError('AI_BLOCKED', 422);
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
  if (!text.trim()) throw new AiError('AI_EMPTY', 502);
  return text.trim();
}

/** تولید متن (و JSON ساخت‌یافته در صورت تعیین schema). */
export async function generateText(env, { system, contents, maxOutputTokens = 1024, json = false, schema = null }) {
  const generationConfig = { maxOutputTokens, temperature: 0.4 };
  if (json) {
    generationConfig.responseMimeType = 'application/json';
    if (schema) generationConfig.responseSchema = schema;
  }
  const data = await post(env, `${GEMINI_API}/models/${encodeURIComponent(modelIds(env).text)}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig,
  });
  const text = extractText(data);
  if (!json) return { text };
  try {
    return { data: JSON.parse(text) };
  } catch {
    throw new AiError('AI_EMPTY', 502);
  }
}

/** تبدیل گفتار به متن از یک فایل صوتی (base64). */
export async function transcribeAudio(env, { mimeType, base64 }) {
  const data = await post(env, `${GEMINI_API}/models/${encodeURIComponent(modelIds(env).text)}:generateContent`, {
    contents: [{
      role: 'user',
      parts: [
        { text: 'این فایل صوتی به زبان فارسی است. فقط متن دقیق گفته‌شده را بدون توضیح اضافه بنویس.' },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0 },
  });
  return { text: extractText(data) };
}

/**
 * تولید صدای فارسی. مدل و شکل درخواست طبق مستندات Interactions API تنظیم شده‌اند؛
 * پیش از فعال‌سازی، با یک کلید واقعی باید تأیید شوند (در گزارش PR آمده است).
 */
export async function synthesizeSpeech(env, text) {
  const data = await post(env, `${GEMINI_API}/interactions`, {
    model: modelIds(env).tts,
    input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice: 'Kore' }] },
  });
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const audio = steps
    .filter((s) => s?.type === 'model_output')
    .flatMap((s) => (Array.isArray(s.content) ? s.content : []))
    .filter((c) => c?.type === 'audio' && typeof c.data === 'string')
    .pop();
  if (!audio) throw new AiError('AI_EMPTY', 502);
  const binary = atob(audio.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType: 'audio/wav' };
}
