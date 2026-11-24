// درگاه تولید متن با مدل‌های GPT؛ کلید فقط از Secret محیطی خوانده می‌شود.
import { AiError } from './gemini.js';

export const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
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

function buildMessages(system, contents) {
  const messages = [{
    role: 'system',
    content: [system || '', 'وقتی خروجی ساخت‌یافته خواسته شده است، فقط یک شیء JSON معتبر و بدون متن پیرامونی برگردان.'].filter(Boolean).join('\n\n'),
  }];
  for (const item of Array.isArray(contents) ? contents : []) {
    const role = item?.role === 'model' || item?.role === 'assistant' ? 'assistant' : 'user';
    const parts = Array.isArray(item?.parts) ? item.parts : [];
    if (parts.some((part) => typeof part?.text !== 'string' || Object.keys(part).some((key) => key !== 'text'))) {
      throw new AiError('AI_UNSUPPORTED_CONTENT', 422);
    }
    const content = parts.map((part) => part.text).join('\n');
    if (content.trim()) messages.push({ role, content });
  }
  return messages;
}

function extractContent(payload) {
  const choice = payload?.choices?.[0];
  if (choice?.message?.refusal) throw new AiError('AI_BLOCKED', 422);
  const content = choice?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim();
  throw new AiError('AI_EMPTY', 502);
}

/** تولید پاسخ متنی یا JSON؛ ورودی‌های تصویری/فایلی عمداً به این مسیر فرستاده نمی‌شوند. */
export async function generateOpenAIText(env, {
  system,
  contents,
  maxOutputTokens = 2048,
  json = false,
  timeoutMs = OPENAI_TIMEOUT_MS,
}) {
  if (!openaiConfigured(env)) throw new AiError('AI_NOT_CONFIGURED', 503);
  const model = openaiModelId(env);
  const messages = buildMessages(system, contents);
  const tokenLimit = Math.max(256, Math.min(Number(maxOutputTokens) || 2048, 16_000));
  let response;
  try {
    response = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: tokenLimit,
        reasoning_effort: safeReasoningEffort(env),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
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
    if (response.status === 429) throw new AiError('AI_QUOTA', 429, { provider: 'openai' });
    if (response.status === 401 || response.status === 403) throw new AiError('AI_KEY_REJECTED', 503, { provider: 'openai' });
    if (response.status === 404) throw new AiError('AI_MODEL_UNAVAILABLE', 503, { provider: 'openai' });
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
  const text = extractContent(payload);
  if (!text) throw new AiError('AI_EMPTY', 502, { provider: 'openai' });

  if (!json) return { text, model, provider: 'openai', usage: payload.usage || null };
  const stripped = text.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/, '');
  let data;
  try {
    data = JSON.parse(stripped);
  } catch {
    throw new AiError('AI_EMPTY', 502, { provider: 'openai', reason: 'INVALID_JSON' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AiError('AI_EMPTY', 502, { provider: 'openai', reason: 'INVALID_JSON_SHAPE' });
  }
  return {
    text,
    data,
    truncated: payload.choices?.[0]?.finish_reason === 'length',
    model,
    provider: 'openai',
    usage: payload.usage || null,
  };
}
