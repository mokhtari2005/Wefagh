// مسیر تولید پاسخ: GPT اصلی، Gemini جایگزین و Groq مسیر پشتیبان نهایی.
import { generateOpenAIText, openaiConfigured } from './openai.js';
import { generateText } from './gemini.js';
import { generateGroqText, groqConfigured } from './groq.js';

const FAILOVER_CODES = new Set([
  'AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE',
  'AI_MODEL_UNAVAILABLE', 'AI_QUOTA', 'AI_NOT_CONFIGURED',
  'AI_KEY_REJECTED', 'AI_REJECTED', 'AI_EMPTY',
]);

/** نشانه‌های ظاهری Markdown را حذف می‌کند و متن، تیترها و شماره‌گذاری حقوقی را نگه می‌دارد. */
export function stripResponseFormatting(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\r/g, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/(^|[\\s([{])\*([^*\\n]+)\*(?=$|[\\s)\\]},.!?؛،:])/gm, '$1$2')
    .replace(/\x60{1,3}/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** سازگاری با پاک‌سازی پاسخ‌های Groq قبلی. */
export const stripGroqFormatting = stripResponseFormatting;

function cleanProviderResult(result) {
  if (!result || typeof result !== 'object') return result;
  const cleaned = { ...result };
  if (typeof cleaned.text === 'string') cleaned.text = stripResponseFormatting(cleaned.text);
  if (cleaned.data && typeof cleaned.data === 'object' && !Array.isArray(cleaned.data)) {
    cleaned.data = { ...cleaned.data };
    if (typeof cleaned.data.text === 'string') cleaned.data.text = stripResponseFormatting(cleaned.data.text);
  }
  return cleaned;
}

function retryable(error) {
  return FAILOVER_CODES.has(error?.code);
}

/**
 * GPT در صورت وجود Secret، مسیر اصلی است. فایل‌های دارای inlineData عمداً به GPT
 * ارسال نمی‌شوند و برای حفظ سازگاری پردازش پیوست، مستقیماً به Gemini می‌روند.
 */
export async function generateTextWithFallback(env, prompt, {
  allowOpenAI = true,
  allowGroq = true,
} = {}) {
  let openaiFailure = null;

  if (allowOpenAI && openaiConfigured(env)) {
    try {
      return cleanProviderResult(await generateOpenAIText(env, prompt));
    } catch (error) {
      if (!retryable(error)) throw error;
      openaiFailure = error;
      console.error(JSON.stringify({
        where: 'ai.failover',
        from: 'openai',
        to: 'gemini',
        reason: error.code || 'OPENAI_FAILED',
      }));
    }
  }

  try {
    const result = await generateText(env, prompt);
    return {
      ...result,
      provider: 'gemini',
      ...(openaiFailure ? { fallbackFrom: 'openai', fallbackReason: openaiFailure.code || 'OPENAI_FAILED' } : {}),
      ...(!allowOpenAI ? { fallbackFrom: 'attachments' } : {}),
    };
  } catch (geminiError) {
    if (!allowGroq || !groqConfigured(env) || !retryable(geminiError)) throw geminiError;
    console.error(JSON.stringify({
      where: 'ai.failover',
      from: 'gemini',
      to: 'groq',
      reason: geminiError.code || 'GEMINI_FAILED',
    }));
    try {
      const result = cleanProviderResult(await generateGroqText(env, prompt));
      console.info(JSON.stringify({ where: 'ai.failover', provider: 'groq', outcome: 'success', model: result?.model || 'unknown' }));
      return {
        ...result,
        ...(openaiFailure ? { fallbackFrom: 'openai', fallbackReason: openaiFailure.code || 'OPENAI_FAILED' } : {}),
      };
    } catch (fallbackError) {
      const code = typeof fallbackError?.code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(fallbackError.code) ? fallbackError.code : 'GROQ_FAILED';
      const status = Number.isInteger(fallbackError?.status) ? fallbackError.status : undefined;
      console.error(JSON.stringify({ where: 'ai.failover', provider: 'groq', outcome: 'failed', code, ...(status ? { status } : {}) }));
      if (geminiError && typeof geminiError === 'object') {
        geminiError.details = {
          ...(geminiError.details || {}),
          fallbackProvider: 'groq',
          fallbackCode: code,
          ...(status ? { fallbackStatus: status } : {}),
          ...(openaiFailure ? { primaryProvider: 'openai', primaryCode: openaiFailure.code || 'OPENAI_FAILED' } : {}),
        };
      }
      throw geminiError;
    }
  }
}
