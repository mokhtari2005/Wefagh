// مسیریاب تولید متن: Gemini اولویت دارد و Groq فقط در خطاهای قابل‌بازیابی جایگزین می‌شود.
import { generateText } from './gemini.js';
import { generateGroqText, groqConfigured } from './groq.js';

const FAILOVER_CODES = new Set(['AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE', 'AI_MODEL_UNAVAILABLE', 'AI_QUOTA', 'AI_NOT_CONFIGURED', 'AI_KEY_REJECTED']);

/** نشانه‌های قالب‌بندی Markdown را از متن Groq حذف می‌کند، بدون دست‌زدن به محتوای حقوقی و شماره‌گذاری. */
export function stripGroqFormatting(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\r/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s)\]},.!?؛،:])/gm, '$1$2')
    .replace(/`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanGroqResult(result) {
  if (!result || result.provider !== 'groq') return result;
  const cleaned = { ...result };
  if (typeof cleaned.text === 'string') cleaned.text = stripGroqFormatting(cleaned.text);
  if (cleaned.data && typeof cleaned.data === 'object' && !Array.isArray(cleaned.data)) {
    cleaned.data = { ...cleaned.data };
    if (typeof cleaned.data.text === 'string') cleaned.data.text = stripGroqFormatting(cleaned.data.text);
  }
  return cleaned;
}

export async function generateTextWithFallback(env, prompt, { allowGroq = true } = {}) {
  try {
    return { ...(await generateText(env, prompt)), provider: 'gemini' };
  } catch (error) {
    if (!allowGroq || !groqConfigured(env) || !FAILOVER_CODES.has(error?.code)) throw error;
    console.error(JSON.stringify({ where: 'ai.failover', from: 'gemini', to: 'groq', reason: error.code }));
    try {
      return cleanGroqResult(await generateGroqText(env, prompt));
    } catch (fallbackError) {
      const code = typeof fallbackError?.code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(fallbackError.code) ? fallbackError.code : 'GROQ_FAILED';
      console.error(JSON.stringify({ where: 'ai.failover', provider: 'groq', code }));
      throw error;
    }
  }
}
