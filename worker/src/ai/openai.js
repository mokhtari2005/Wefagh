// درگاه تولید متن با مدل‌های GPT از Responses API؛ کلید فقط از Secret محیطی خوانده می‌شود.
import { AiError } from './gemini.js';

export const OPENAI_API = 'https://api.openai.com/v1/responses';
export const OPENAI_DEFAULT_MODEL = 'gpt-6.2-astra';
export const OPENAI_TIMEOUT_MS = 45_000;

export function openaiConfigured(env) {
  return typeof env?.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length >= 20;
}

export function openaiModelId(env) {
  return typeof env?.OPENAI_TEXT_MODEL === 'string' && env.OPENAI_TEXT_MODEL.trim()
    ? env.OPENAI_TEXT_MODEL.trim()
    : OPENAI_DEFAULT_MODEL;
}

function safeReasoningEffort(env) {
  const value = String(env?.OPENAI_REASONING_EFFORT || 'medium').toLowerCase();
  return ['low', 'medium', 'high', 'xhigh'].includes(value) ? value : 'medium';
}

const JSON_SCHEMA_TYPES = Object.freeze({
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  BOOLEAN: 'boolean',
  NUMBER: 'number',
  INTEGER: 'integer',
});

/** تبدیل طرح‌واره Gemini به JSON Schema سخت‌گیرانه؛ ویژگی‌های اختیاری به‌صورت nullable حفظ می‌شوند. */
export function toOpenAIJsonSchema(source, required = true) {
  if (!source || typeof source !== 'object') return { type: 'string' };
  const rawType = String(source.type || 'STRING').toUpperCase();
  const type = JSON_SCHEMA_TYPES[rawType] || 'string';
  let output;

  if (type === 'object') {
    const entries = Object.entries(source.properties || {});
    const requiredKeys = new Set(Array.isArray(source.required) ? source.required : []);
    const properties = {};
    for (const [key, child] of entries) {
      properties[key] = toOpenAIJsonSchema(child, requiredKeys.has(key));
    }
    output = {
      type: 'object',
      properties,
      required: entries.map(([key]) => key),
      additionalProperties: false,
    };
  } else if (type === 'array') {
    output = { type: 'array', items: toOpenAIJsonSchema(source.items, true) };
  } else {
    output = { type };
  }

  if (Array.isArray(source.enum)) output.enum = source.enum;
  if (source.description) output.description = String(source.description);
  return required ? output : { anyOf: [output, { type: 'null' }] };
}

function buildInput(contents) {
  const input = [];
  for (const item of Array.isArray(contents) ? contents : []) {
    const role = item?.role === 'model' || item?.role === 'assistant' ? 'assistant' : 'user';
    const parts = Array.isArray(item?.parts) ? item.parts : [];
    if (parts.some((part) => typeof part?.text !== 'string' || Object.keys(part).some((key) => key !== 'text'))) {
      throw new AiError('AI_UNSUPPORTED_CONTENT', 422);
    }
    const content = parts.map((part) => part.text).join('\n');
    if (content.trim()) input.push({ role, content });
  }
  return input;
}

function extractContent(payload) {
  if (payload?.status === 'failed' || payload?.error) {
    throw new AiError('AI_PROVIDER_ERROR', 503, { provider: 'openai' });
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const messageParts = output
    .filter((item) => item?.type === 'message' && (!item.role || item.role === 'assistant'))
    .flatMap((item) => Array.isArray(item.content) ? item.content : []);
  if (messageParts.some((part) => part?.type === 'refusal' || part?.refusal)) {
    throw new AiError('AI_BLOCKED', 422, { provider: 'openai' });
  }
  const content = messageParts
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  const fallback = typeof payload?.output_text === 'string' ? payload.output_text : '';
  const text = (content || fallback).trim();
  if (!text) throw new AiError('AI_EMPTY', 502, { provider: 'openai' });
  return text;
}

/** آزمون سبک اتصال برای پنل مدیر؛ متن پاسخ و کلید هرگز بازگردانده نمی‌شود. */
export async function probeOpenAI(env, timeoutMs = 20_000) {
  const model = openaiModelId(env);
  if (!openaiConfigured(env)) return { model, status: 'not_configured', ok: false };
  const started = Date.now();
  try {
    await generateOpenAIText(env, {
      system: 'فقط یک پاسخ کوتاه بده.',
      contents: [{ role: 'user', parts: [{ text: 'برای آزمون اتصال فقط بنویس: OK' }] }],
      maxOutputTokens: 128,
      timeoutMs,
    });
    return { model, status: 'ok', ok: true, ms: Date.now() - started };
  } catch (error) {
    return {
      model,
      status: 'error',
      ok: false,
      code: typeof error?.code === 'string' ? error.code : 'AI_PROVIDER_ERROR',
      httpStatus: Number.isInteger(error?.details?.providerStatus) ? error.details.providerStatus : (Number.isInteger(error?.status) ? error.status : undefined),
      ms: Date.now() - started,
    };
  }
}

export function openaiProbeHint(result) {
  if (result?.status === 'ok') return 'سالم';
  if (result?.status === 'not_configured') return 'کلید OPENAI_API_KEY ثبت نشده است';
  if (result?.code === 'AI_QUOTA') return 'محدودیت سهمیه یا نرخ درخواست';
  if (result?.code === 'AI_KEY_REJECTED') return 'کلید نامعتبر یا فاقد دسترسی';
  if (result?.code === 'AI_MODEL_UNAVAILABLE') return 'مدل در این حساب در دسترس نیست';
  if (result?.code === 'AI_NETWORK_ERROR') return 'خطای شبکه یا پایان مهلت پاسخ';
  return 'سرویس پاسخ معتبر نداد';
}

/** تولید پاسخ متنی یا JSON؛ ورودی‌های تصویری/فایلی عمداً به این مسیر فرستاده نمی‌شوند. */
export async function generateOpenAIText(env, {
  system,
  contents,
  maxOutputTokens = 2048,
  json = false,
  schema = null,
  timeoutMs = OPENAI_TIMEOUT_MS,
}) {
  if (!openaiConfigured(env)) throw new AiError('AI_NOT_CONFIGURED', 503);
  const model = openaiModelId(env);
  const input = buildInput(contents);
  const tokenLimit = Math.max(256, Math.min(Number(maxOutputTokens) || 2048, 16_000));
  const instructions = [
    system || '',
    json ? 'وقتی خروجی ساخت‌یافته خواسته شده است، فقط یک شیء JSON معتبر و مطابق طرح‌واره برگردان؛ متن پیرامونی یا حصار Markdown اضافه نکن.' : '',
  ].filter(Boolean).join('\n\n');

  const body = {
    model,
    instructions,
    input,
    max_output_tokens: tokenLimit,
    reasoning: { effort: safeReasoningEffort(env) },
    store: false,
    ...(json ? {
      text: {
        format: schema
          ? { type: 'json_schema', name: 'legal_assistant_response', strict: true, schema: toOpenAIJsonSchema(schema) }
          : { type: 'json_object' },
      },
    } : {}),
  };

  let response;
  try {
    response = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(Number(timeoutMs) || OPENAI_TIMEOUT_MS, 90_000)),
    });
  } catch (error) {
    const name = String(error?.name || '').toUpperCase();
    throw new AiError('AI_NETWORK_ERROR', 503, {
      reason: name === 'TIMEOUTERROR' || name === 'ABORTERROR' ? 'TIMEOUT' : 'FETCH_ERROR',
      provider: 'openai',
    });
  }

  if (!response.ok) {
    if (response.status === 429) throw new AiError('AI_QUOTA', 429, { provider: 'openai', providerStatus: response.status });
    if (response.status === 401 || response.status === 403) throw new AiError('AI_KEY_REJECTED', 503, { provider: 'openai', providerStatus: response.status });
    if (response.status === 404) throw new AiError('AI_MODEL_UNAVAILABLE', 503, { provider: 'openai', providerStatus: response.status });
    if (response.status >= 500 || response.status === 408 || response.status === 499) {
      throw new AiError('AI_PROVIDER_ERROR', 503, { provider: 'openai', providerStatus: response.status });
    }
    throw new AiError('AI_REJECTED', 502, { provider: 'openai', providerStatus: response.status });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AiError('AI_PROVIDER_BAD_RESPONSE', 503, { provider: 'openai' });
  }

  if (payload?.incomplete_details?.reason === 'content_filter') {
    throw new AiError('AI_BLOCKED', 422, { provider: 'openai' });
  }
  const truncated = payload?.status === 'incomplete' || payload?.incomplete_details?.reason === 'max_output_tokens';
  if (json && truncated) throw new AiError('AI_PROVIDER_ERROR', 502, { provider: 'openai', reason: 'OUTPUT_TRUNCATED' });
  const text = extractContent(payload);

  if (!json) return { text, model, provider: 'openai', usage: payload.usage || null, truncated };
  const stripped = text.replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '');
  let data;
  try {
    data = JSON.parse(stripped);
  } catch {
    throw new AiError('AI_EMPTY', 502, { provider: 'openai', reason: 'INVALID_JSON' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AiError('AI_EMPTY', 502, { provider: 'openai', reason: 'INVALID_JSON_SHAPE' });
  }
  return { text, data, truncated, model, provider: 'openai', usage: payload.usage || null };
}
