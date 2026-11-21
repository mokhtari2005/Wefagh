// تولید متن فقط با Gemini انجام می‌شود؛ Groq صرفاً برای بازبینی مستقل استفاده می‌شود.
import { generateText } from './gemini.js';

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
    .replace(/`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** نام قدیمی برای سازگاری با مصرف‌کنندگان قبلی. */
export const stripGroqFormatting = stripResponseFormatting;

/**
 * سازگاری نام تابع حفظ شده است؛ مسیر پشتیبان فقط درون Gemini (مدل جایگزین) است.
 * گزینه‌های قدیمی allowGroq عمداً نادیده گرفته می‌شوند تا Groq هرگز تولیدکنندهٔ پاسخ نشود.
 */
export async function generateTextWithFallback(env, prompt) {
  return { ...(await generateText(env, prompt)), provider: 'gemini' };
}
