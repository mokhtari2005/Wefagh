// کلاینت Gemini برای Worker. کلید فقط از Secret محیطی GEMINI_API_KEY خوانده می‌شود و فقط در هدر x-goog-api-key می‌رود.
// هیچ بدنهٔ درخواست یا پاسخ، متن پرونده یا کلید در لاگ یا پیام خطا نوشته نمی‌شود.

import { splitForSpeech, concatWav, SPEECH_CHUNK_CHARS } from './speech.js';

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

// فقط مقدارهای شمارشی (مثل PERMISSION_DENIED یا MAX_TOKENS) به لاگ می‌روند؛ پیام متنی Google ممکن است ورودی را تکرار کند.
const ENUM_RE = /^[A-Z][A-Z0-9_]{1,39}$/;
const safeEnum = (v) => (typeof v === 'string' && ENUM_RE.test(v) ? v : undefined);

/** لاگ تشخیصی بدون کلید، متن پرونده، متن گفت‌وگو یا بدنهٔ پاسخ. */
export function logGeminiFailure(op, model, fields) {
  console.error(JSON.stringify({ where: 'gemini', op, model, ...fields }));
}

async function post(env, op, model, url, payload) {
  if (!aiConfigured(env)) throw new AiError('AI_NOT_CONFIGURED', 503);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY.trim() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    logGeminiFailure(op, model, { stage: 'network', reason: safeEnum(String(err?.name || '').toUpperCase()) || 'FETCH_ERROR' });
    throw new AiError('AI_UNAVAILABLE', 503);
  }
  if (!res.ok) {
    let reason;
    try { reason = safeEnum((await res.json())?.error?.status); } catch { reason = undefined; }
    logGeminiFailure(op, model, { stage: 'http', httpStatus: res.status, reason });
    if (res.status === 429) throw new AiError('AI_QUOTA', 429);
    if (res.status === 401 || res.status === 403) throw new AiError('AI_KEY_REJECTED', 503);
    if (res.status === 404) throw new AiError('AI_MODEL_UNAVAILABLE', 503);
    if (res.status >= 500) throw new AiError('AI_UNAVAILABLE', 503);
    throw new AiError('AI_REJECTED', 502);
  }
  try {
    return await res.json();
  } catch {
    logGeminiFailure(op, model, { stage: 'body', reason: 'BAD_JSON' });
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

function textOrLog(op, model, data) {
  try {
    return extractText(data);
  } catch (err) {
    logGeminiFailure(op, model, {
      stage: 'content',
      reason: err.code,
      finishReason: safeEnum(data?.candidates?.[0]?.finishReason),
      blockReason: safeEnum(data?.promptFeedback?.blockReason),
    });
    throw err;
  }
}

/** تولید متن (و JSON ساخت‌یافته در صورت تعیین schema). */
export async function generateText(env, { system, contents, maxOutputTokens = 1024, json = false, schema = null }) {
  const generationConfig = { maxOutputTokens, temperature: 0.4 };
  if (json) {
    generationConfig.responseMimeType = 'application/json';
    if (schema) generationConfig.responseSchema = schema;
  }
  const model = modelIds(env).text;
  const data = await post(env, 'text', model, `${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig,
  });
  const text = textOrLog('text', model, data);
  if (!json) return { text };
  try {
    return { data: JSON.parse(text) };
  } catch {
    logGeminiFailure('text', model, { stage: 'content', reason: 'BAD_JSON_OUTPUT', finishReason: safeEnum(data?.candidates?.[0]?.finishReason) });
    throw new AiError('AI_EMPTY', 502);
  }
}

/** تبدیل گفتار به متن از یک فایل صوتی (base64). */
export async function transcribeAudio(env, { mimeType, base64 }) {
  const model = modelIds(env).text;
  const data = await post(env, 'transcribe', model, `${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
    contents: [{
      role: 'user',
      parts: [
        { text: 'این فایل صوتی به زبان فارسی است. فقط متن دقیق گفته‌شده را بدون توضیح اضافه بنویس.' },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0 },
  });
  return { text: textOrLog('transcribe', model, data) };
}

/**
 * تولید صدای فارسی برای یک متن کوتاه. مدل و شکل درخواست طبق مستندات Interactions API است
 * (https://ai.google.dev/gemini-api/docs/speech-generation).
 */
export async function synthesizeSpeech(env, text, voice = 'Kore') {
  const model = modelIds(env).tts;
  const data = await post(env, 'speech', model, `${GEMINI_API}/interactions`, {
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice }] },
  });
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const audio = steps
    .filter((s) => s?.type === 'model_output')
    .flatMap((s) => (Array.isArray(s.content) ? s.content : []))
    .filter((c) => c?.type === 'audio' && typeof c.data === 'string')
    .pop();
  if (!audio) {
    logGeminiFailure('speech', model, { stage: 'content', reason: 'NO_AUDIO', steps: steps.length });
    throw new AiError('AI_EMPTY', 502);
  }
  const binary = atob(audio.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType: 'audio/wav' };
}

/** متن بلند را در مرز جمله‌ها تکه می‌کند، تکه‌ها را هم‌زمان می‌سازد و یک WAV واحد برمی‌گرداند. */
export async function synthesizeLongSpeech(env, text, voice = 'Kore') {
  const parts = splitForSpeech(text, SPEECH_CHUNK_CHARS);
  if (parts.length === 1) return synthesizeSpeech(env, parts[0], voice);
  const results = await Promise.all(parts.map((part) => synthesizeSpeech(env, part, voice)));
  const bytes = concatWav(results.map((r) => r.bytes));
  if (!bytes) {
    logGeminiFailure('speech', modelIds(env).tts, { stage: 'content', reason: 'WAV_MISMATCH', parts: parts.length });
    throw new AiError('AI_EMPTY', 502);
  }
  return { bytes, mimeType: 'audio/wav' };
}
