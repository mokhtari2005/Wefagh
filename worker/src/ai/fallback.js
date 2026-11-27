// مسیر تولید پاسخ: در حالت صفرهزینه Gemini 3.5، سپس Groq Free و Workers AI Free؛ مسیر قدیمی پولی جدا و در این حالت غیرفعال است.
import { generateOpenAIText, openaiConfigured } from './openai.js';
import { generateText, aiConfigured } from './gemini.js';
import { generateGroqText, groqConfigured } from './groq.js';
import { generateWorkersAIText, workersAiPrimaryEnabled } from './cloudflare.js';

const ZERO_COST_GEMINI_FAILOVER_CODES = new Set([
  'AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE', 'AI_MODEL_UNAVAILABLE',
  'AI_QUOTA', 'AI_NOT_CONFIGURED', 'AI_KEY_REJECTED', 'AI_EMPTY', 'AI_ZERO_COST_GEMINI_NOT_CONFIGURED',
]);

const FAILOVER_CODES = new Set([
  'AI_NETWORK_ERROR', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_BAD_RESPONSE',
  'AI_MODEL_UNAVAILABLE', 'AI_QUOTA', 'AI_NOT_CONFIGURED',
  'AI_KEY_REJECTED', 'AI_REJECTED', 'AI_EMPTY',
]);

/** نشانه‌های ظاهری Markdown را حذف می‌کند و متن، تیترها و شماره‌گذاری حقوقی را نگه می‌دارد. */
export function stripResponseFormatting(value) {
  if (typeof value !== 'string') return value;
  const normalized = value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
  return normalized
    .replace(/\r/g, '')
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s)},.!?؛،:])/gm, '$1$2')
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
  // حالت صفرهزینه: زنجیرهٔ ثابت Gemini 3.5 → Groq Free → Workers AI Free.
  // در این شاخه OpenAI و هر مدل/مسیر پولی مطلقاً فراخوانی نمی‌شوند.
  if (env?.AI_BILLING_MODE === 'zero') {
    const hasInlineData = (Array.isArray(prompt?.contents) ? prompt.contents : [])
      .some((item) => Array.isArray(item?.parts) && item.parts.some((part) => part && typeof part === 'object' && 'inlineData' in part));
    let geminiFailure = null;

    if (env?.GEMINI_FREE_TIER_CONFIRMED === 'true') {
      if (aiConfigured(env) && (env?.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite') === 'gemini-3.5-flash-lite') {
        try {
          const result = await generateText(env, { ...prompt, allowModelFallback: false, useGoogleSearch: false });
          return cleanProviderResult({ ...result, provider: 'gemini' });
        } catch (error) {
          // خطای مسدودسازی محتوا یا رد اعتبارسنجی نباید با تعویض مدل دور زده شود.
          if (!ZERO_COST_GEMINI_FAILOVER_CODES.has(error?.code)) throw error;
          geminiFailure = error;
          console.warn(JSON.stringify({ where: 'ai.zero_cost_failover', from: 'gemini', reason: error?.code || 'GEMINI_FAILED' }));
        }
      } else {
        geminiFailure = Object.assign(new Error('AI_ZERO_COST_GEMINI_NOT_CONFIGURED'), {
          code: 'AI_ZERO_COST_GEMINI_NOT_CONFIGURED', status: 503,
        });
      }
    } else {
      geminiFailure = Object.assign(new Error('AI_ZERO_COST_GEMINI_DISABLED'), {
        code: 'AI_ZERO_COST_GEMINI_DISABLED', status: 503,
      });
    }

    let groqFailure = null;
    if (allowGroq && !hasInlineData && env?.GROQ_FREE_TIER_CONFIRMED === 'true' && groqConfigured(env)) {
      try {
        const result = cleanProviderResult(await generateGroqText(env, prompt));
        console.info(JSON.stringify({ where: 'ai.zero_cost_failover', from: 'gemini', to: 'groq', outcome: 'success', model: result?.model || 'unknown' }));
        return { ...result, provider: 'groq', fallbackFrom: 'gemini', fallbackReason: geminiFailure?.code || 'GEMINI_UNAVAILABLE' };
      } catch (error) {
        groqFailure = error;
        console.warn(JSON.stringify({ where: 'ai.zero_cost_failover', from: 'groq', reason: error?.code || 'GROQ_FAILED' }));
      }
    }

    // Workers AI فقط آخرین مسیر رایگان است؛ محتوای باینری هرگز بی‌اجازه به سرویس دیگری منتقل نمی‌شود.
    if (!hasInlineData && workersAiPrimaryEnabled(env)) {
      try {
        const result = cleanProviderResult(await generateWorkersAIText(env, prompt));
        return {
          ...result,
          provider: 'cloudflare',
          fallbackFrom: groqFailure ? 'groq' : 'gemini',
          fallbackReason: groqFailure?.code || geminiFailure?.code || 'FREE_PROVIDER_UNAVAILABLE',
        };
      } catch (error) {
        console.error(JSON.stringify({ where: 'ai.zero_cost_failover', from: 'cloudflare_workers_ai', reason: error?.code || 'WORKERS_AI_FAILED' }));
        // اگر همهٔ مسیرها شکست خوردند، آخرین خطای واقعی را برمی‌گردانیم تا کد سهمیه/اختلال گم نشود.
        throw error;
      }
    }

    if (groqFailure) throw groqFailure;
    if (env?.GEMINI_FREE_TIER_CONFIRMED === 'true' && geminiFailure) throw geminiFailure;
    throw Object.assign(new Error('AI_ZERO_COST_PROVIDER_DISABLED'), { code: 'AI_ZERO_COST_PROVIDER_DISABLED', status: 503 });
  }

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
