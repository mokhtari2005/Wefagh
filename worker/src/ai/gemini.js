// کلاینت Gemini برای Worker. کلید فقط از Secret محیطی GEMINI_API_KEY خوانده می‌شود و فقط در هدر x-goog-api-key می‌رود.
// هیچ بدنهٔ درخواست یا پاسخ، متن پرونده یا کلید در لاگ یا پیام خطا نوشته نمی‌شود.

import { splitForSpeech, concatWav, SPEECH_CHUNK_CHARS } from './speech.js';

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
export const AI_TIMEOUT_MS = 40_000;

// فقط خطاهای گذرا یا در دسترس نبودن یک مدل، یک بار با مدل جایگزین امتحان می‌شوند.
// سهمیهٔ تمام‌شده و خطای کلید/دسترسی با تکرار درخواست حل نمی‌شوند و نباید مصرف بیشتری ایجاد کنند.
const FALLBACK_CODES = new Set(['AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE', 'AI_MODEL_UNAVAILABLE']);

// شناسه‌های مدل از متغیرهای [vars] خوانده می‌شوند تا بدون تغییر کد قابل تعویض باشند.
export function modelIds(env) {
  return {
    text: env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
    tts: env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
  };
}

export function fallbackTextModel(primary) {
  return primary === 'gemini-3.5-flash-lite' ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
}

export function aiConfigured(env) {
  return typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim().length >= 10;
}

/** خطای امن برای پاسخ HTTP: کد ثابت و وضعیت، بدون جزئیات فنی یا داده. */
export class AiError extends Error {
  constructor(code, status, details = {}) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// فقط مقدارهای شمارشی (مثل PERMISSION_DENIED یا MAX_TOKENS) به لاگ می‌روند؛ پیام متنی Google ممکن است ورودی را تکرار کند.
const ENUM_RE = /^[A-Z][A-Z0-9_]{1,39}$/;
const safeEnum = (v) => (typeof v === 'string' && ENUM_RE.test(v) ? v : undefined);

/** لاگ تشخیصی بدون کلید، متن پرونده، متن گفت‌وگو یا بدنهٔ پاسخ. */
export function logGeminiFailure(op, model, fields) {
  console.error(JSON.stringify({ where: 'gemini', op, model, ...fields }));
}

async function post(env, op, model, url, payload, timeoutMs = AI_TIMEOUT_MS) {
  if (!aiConfigured(env)) throw new AiError('AI_NOT_CONFIGURED', 503);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY.trim() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = safeEnum(String(err?.name || '').toUpperCase()) || 'FETCH_ERROR';
    logGeminiFailure(op, model, { stage: 'network', reason });
    throw new AiError('AI_NETWORK_ERROR', 503, { reason });
  }
  if (!res.ok) {
    let reason;
    try { reason = safeEnum((await res.json())?.error?.status); } catch { reason = undefined; }
    logGeminiFailure(op, model, { stage: 'http', httpStatus: res.status, reason });
    if (res.status === 429) throw new AiError('AI_QUOTA', 429);
    if (res.status === 401 || res.status === 403) throw new AiError('AI_KEY_REJECTED', 503);
    if (res.status === 404) throw new AiError('AI_MODEL_UNAVAILABLE', 503);
    if (res.status >= 500 || res.status === 499 || res.status === 408) throw new AiError('AI_PROVIDER_ERROR', 503, { providerStatus: res.status, ...(reason ? { providerReason: reason } : {}) });
    throw new AiError('AI_REJECTED', 502);
  }
  try {
    return await res.json();
  } catch (err) {
    const errorName = String(err?.name || '').toUpperCase();
    const timedOut = errorName === 'ABORTERROR' || errorName === 'TIMEOUTERROR';
    const reason = timedOut ? 'TIMEOUT' : 'BAD_JSON';
    logGeminiFailure(op, model, { stage: 'body', reason });
    if (timedOut) throw new AiError('AI_NETWORK_ERROR', 503, { reason, stage: 'body' });
    throw new AiError('AI_PROVIDER_BAD_RESPONSE', 503);
  }
}

/** متن پاسخ مدل. اگر محتوا بلاک شده یا خالی باشد خطای مشخص برمی‌گرداند. */
export function extractGrounding(data) {
  const candidate = data?.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  if (!metadata) return null;
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
  const candidateText = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('')
    : '';
  const sources = chunks.map((chunk) => {
    const web = chunk?.web;
    if (!web || typeof web.uri !== 'string' || !/^https:\/\//i.test(web.uri)) return null;
    return { title: String(web.title || '').slice(0, 180), uri: web.uri, supportedClaim: '' };
  });
  for (const support of Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : []) {
    const segment = support?.segment || {};
    const start = Number.isInteger(segment.startIndex) ? segment.startIndex : null;
    const end = Number.isInteger(segment.endIndex) ? segment.endIndex : null;
    // groundingSupports.segment.text is a passage from the model response, not text fetched from the linked web page.
    const supportedClaim = typeof segment.text === 'string' ? segment.text
      : start !== null && end !== null && start >= 0 && end >= start && end <= candidateText.length
        ? candidateText.slice(start, end)
        : '';
    for (const index of Array.isArray(support.groundingChunkIndices) ? support.groundingChunkIndices : []) {
      if (Number.isInteger(index) && sources[index] && supportedClaim) {
        sources[index].supportedClaim = [sources[index].supportedClaim, supportedClaim].filter(Boolean).join('؛ ').slice(0, 700);
      }
    }
  }
  const validSources = sources.filter(Boolean);
  const queries = Array.isArray(metadata.webSearchQueries)
    ? metadata.webSearchQueries.filter((q) => typeof q === 'string').slice(0, 5)
    : [];
  const searchSuggestionHtml = typeof metadata.searchEntryPoint?.renderedContent === 'string'
    ? metadata.searchEntryPoint.renderedContent
    : '';
  return validSources.length || queries.length || searchSuggestionHtml
    ? { sources: validSources, queries, searchSuggestionHtml }
    : null;
}

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
export async function generateText(env, { system, contents, maxOutputTokens = 1024, json = false, schema = null, timeoutMs = AI_TIMEOUT_MS, plainFallback = false, useGoogleSearch = false }) {
  const configuredModel = modelIds(env).text;
  const fallbackModel = fallbackTextModel(configuredModel);
  const makePayload = (model, { useSchema, useMime }) => {
    // Gemini 3 defaults to medium reasoning; low keeps interactive latency predictable.
    const generationConfig = { maxOutputTokens };
    if (model.startsWith('gemini-3.') && model !== fallbackModel) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    // Gemini 2.5 Flash به‌طور پیش‌فرض «تفکر پویا» دارد که پاسخ را کند می‌کند؛ برای دستیار تعاملی خاموش می‌شود.
    else if (model.startsWith('gemini-2.5-flash') && !model.includes('lite')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (json && useMime) {
      generationConfig.responseMimeType = 'application/json';
      if (schema && useSchema) generationConfig.responseSchema = schema;
    }
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig,
      ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
    };
  };
  // برنامهٔ تلاش‌ها: مدل اصلی، مدل جایگزین، و (فقط اگر خواسته شود) یک درخواست ساده بدون schema و بدون حالت JSON
  // برای وقتی که Google به‌خاطر شکل درخواست ساخت‌یافته خطای 5xx می‌دهد.
  const plan = [{ model: configuredModel, useSchema: true, useMime: true, timeout: Math.min(timeoutMs, 45_000) }];
  plan.push({ model: fallbackModel, useSchema: true, useMime: true, timeout: 25_000 });
  // مرحلهٔ ساده با مدل اصلی اجرا می‌شود تا اثر «شکل درخواست» از «اختلال مدل جایگزین» جدا شود.
  if (plainFallback && json) plan.push({ model: configuredModel, useSchema: false, useMime: false, timeout: 15_000, plain: true });
  let model = configuredModel;
  let data;
  let used = plan[0];
  let lastErr;
  for (let i = 0; i < plan.length; i += 1) {
    const step = plan[i];
    if (i > 0) {
      // خطای کلید معتبر، بلاک‌شدن محتوا و رد درخواست هرگز دوباره تلاش نمی‌شود. مرحلهٔ ساده فقط برای 5xx است.
      const retryable = step.plain ? lastErr?.code === 'AI_PROVIDER_ERROR' : FALLBACK_CODES.has(lastErr?.code);
      if (!retryable) throw lastErr;
      logGeminiFailure('text', plan[i - 1].model, { stage: 'fallback', reason: step.plain ? 'PLAIN_TEXT' : lastErr.code, fallbackModel });
    }
    try {
      data = await post(env, 'text', step.model, `${GEMINI_API}/models/${encodeURIComponent(step.model)}:generateContent`, makePayload(step.model, step), step.timeout);
      model = step.model;
      used = step;
      break;
    } catch (err) {
      lastErr = err;
      if (i === plan.length - 1) throw err;
    }
  }
  const text = textOrLog('text', model, data);
  const grounding = useGoogleSearch ? extractGrounding(data) : null;
  if (!json) return { text, model, ...(grounding ? { grounding } : {}) };
  if (used.plain) {
    // پاسخ ساده: اگر مدل JSON داد همان را می‌پذیریم، وگرنه کل متن را پاسخ نهایی می‌گیریم.
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const value = JSON.parse(stripped);
      if (value && typeof value === 'object' && typeof value.text === 'string') return { data: value, model, ...(grounding ? { grounding } : {}) };
    } catch { /* متن عادی است */ }
    return { data: { status: 'ready', questions: [], notes: [], text }, model, ...(grounding ? { grounding } : {}) };
  }
  let parsed;
  let parseFailed = false;
  try {
    parsed = JSON.parse(text);
  } catch {
    parseFailed = true;
  }
  if (!parseFailed) {
    // JSON معتبر ولی غیرشیء (null، عدد، رشته یا آرایه) نباید به مسیرهای بعدی برسد و استثنای عمومی بسازد.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logGeminiFailure('text', model, { stage: 'content', reason: 'BAD_JSON_SHAPE', finishReason: safeEnum(data?.candidates?.[0]?.finishReason) });
      throw new AiError('AI_EMPTY', 502);
    }
    return { data: parsed, model, ...(grounding ? { grounding } : {}) };
  }
  {
    // پاسخ طولانی ممکن است وسط JSON قطع شود (MAX_TOKENS)؛ بخش سالم متن را نگه می‌داریم به‌جای خطا.
    const finishReason = safeEnum(data?.candidates?.[0]?.finishReason);
    const repaired = finishReason === 'MAX_TOKENS' ? repairTruncatedJson(text) : null;
    if (repaired) {
      logGeminiFailure('text', model, { stage: 'content', reason: 'JSON_REPAIRED', finishReason });
      return { data: repaired, truncated: true, model, ...(grounding ? { grounding } : {}) };
    }
    logGeminiFailure('text', model, { stage: 'content', reason: 'BAD_JSON_OUTPUT', finishReason });
    throw new AiError('AI_EMPTY', 502);
  }
}

/** JSON قطع‌شده در میان رشتهٔ text را با بستن رشته و آبجکت ترمیم می‌کند؛ در صورت ناموفق بودن null. */
export function repairTruncatedJson(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trimEnd();
  const trailingBackslashes = (s.match(/\\*$/) || [''])[0].length;
  if (trailingBackslashes % 2 === 1) s = s.slice(0, -1);
  s = s.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
  for (const suffix of ['"}', '"]}', '"],"notes":[]}', '"],"questions":[],"notes":[]}']) {
    try {
      const value = JSON.parse(s + suffix);
      if (value && typeof value === 'object' && typeof value.text === 'string' && value.text.trim()) return value;
    } catch { /* ادامه با پسوند بعدی */ }
  }
  return null;
}

/** تبدیل گفتار به متن از یک فایل صوتی (base64). */
const TRANSCRIBE_LANGS = { fa: 'فارسی', en: 'انگلیسی', ar: 'عربی' };

export async function transcribeAudio(env, { mimeType, base64, language = 'fa' }) {
  const model = modelIds(env).text;
  const langName = TRANSCRIBE_LANGS[language] || TRANSCRIBE_LANGS.fa;
  const url = `${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: `این فایل صوتی به زبان ${langName} است. فقط متن دقیق گفته‌شده را با نشانه‌گذاری درست و بدون هیچ توضیح اضافه بنویس. اگر صدایی قابل‌تشخیص نبود، پاسخ را خالی بگذار.` },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 4000,
      ...(model.startsWith('gemini-3.') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
    },
  };
  // خطای موقت Gemini (۵xx، قطع شبکه، پاسخ خالی/نامعتبر) یک بار تکرار می‌شود؛ سهمیه و خطای کلید هرگز.
  const RETRY = new Set(['AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE', 'AI_EMPTY']);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const data = await post(env, 'transcribe', model, url, body, 120_000);
      return { text: textOrLog('transcribe', model, data) };
    } catch (err) {
      lastError = err;
      if (!(err instanceof AiError) || !RETRY.has(err.code)) throw err;
    }
  }
  throw lastError;
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

/**
 * بررسی یک مدل با درخواست بسیار کوچک، فقط برای تشخیص مدیر. هیچ متن یا کلیدی برنمی‌گرداند؛
 * فقط وضعیت HTTP، مقدار شمارشی خطا و زمان پاسخ.
 */
export async function probeModel(env, model) {
  if (!aiConfigured(env)) return { model, ok: false, reason: 'AI_NOT_CONFIGURED' };
  const started = Date.now();
  try {
    const res = await fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY.trim() },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'سلام' }] }],
        generationConfig: { maxOutputTokens: 8, ...(model.startsWith('gemini-2.5-flash') && !model.includes('lite') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const ms = Date.now() - started;
    if (res.ok) return { model, ok: true, httpStatus: res.status, ms };
    let reason;
    try { reason = safeEnum((await res.json())?.error?.status); } catch { reason = undefined; }
    return { model, ok: false, httpStatus: res.status, ...(reason ? { reason } : {}), ms };
  } catch (err) {
    return { model, ok: false, reason: safeEnum(String(err?.name || '').toUpperCase()) || 'FETCH_ERROR', ms: Date.now() - started };
  }
}

/** راهنمای فارسی برای نتیجهٔ probeModel. */
export function probeHint(result) {
  if (result.ok) return 'سالم';
  if (result.reason === 'AI_NOT_CONFIGURED') return 'GEMINI_API_KEY در Worker تعریف نشده است.';
  if (result.httpStatus === 404) return 'این مدل برای این کلید در دسترس نیست یا نام آن اشتباه است.';
  if (result.httpStatus === 403) return 'دسترسی رد شد: کلید برای این مدل مجاز نیست یا Generative Language API در پروژه فعال نیست.';
  if (result.httpStatus === 400) return 'درخواست یا کلید نامعتبر است (کلید API را در Cloudflare بررسی کنید).';
  if (result.httpStatus === 429) return 'سهمیهٔ این مدل پر شده است (Billing یا سقف رایگان).';
  if (result.httpStatus === 499 || result.httpStatus === 408) return 'درخواست از سمت Google لغو شد (CANCELLED)؛ معمولاً موقتی است.';
  if (result.httpStatus >= 500) return 'خطای موقت از سمت Google؛ چند دقیقه بعد دوباره بررسی کنید.';
  if (result.reason === 'TIMEOUTERROR' || result.reason === 'ABORTERROR') return 'پاسخی در ۲۰ ثانیه نیامد.';
  return 'علت نامشخص؛ لاگ Worker را ببینید.';
}
