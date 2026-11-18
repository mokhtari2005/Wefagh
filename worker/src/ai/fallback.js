// مسیریاب تولید متن: Gemini اولویت دارد و Groq فقط در خطاهای قابل‌بازیابی جایگزین می‌شود.
import { generateText } from './gemini.js';
import { generateGroqText, groqConfigured } from './groq.js';

const FAILOVER_CODES = new Set(['AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE', 'AI_MODEL_UNAVAILABLE', 'AI_QUOTA']);

export async function generateTextWithFallback(env, prompt, { allowGroq = true } = {}) {
  try {
    return { ...(await generateText(env, prompt)), provider: 'gemini' };
  } catch (error) {
    if (!allowGroq || !groqConfigured(env) || !FAILOVER_CODES.has(error?.code)) throw error;
    console.error(JSON.stringify({ where: 'ai.failover', from: 'gemini', to: 'groq', reason: error.code }));
    try {
      return await generateGroqText(env, prompt);
    } catch (fallbackError) {
      const code = typeof fallbackError?.code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(fallbackError.code) ? fallbackError.code : 'GROQ_FAILED';
      console.error(JSON.stringify({ where: 'ai.failover', provider: 'groq', code }));
      throw error;
    }
  }
}
