// تشخیص هوش مصنوعی برای مدیر: مدل‌های تنظیم‌شده را با یک درخواست کوچک می‌سنجد. مقدار کلید یا متن پاسخ هرگز برنمی‌گردد.
import { json } from './http.js';
import { requireMailAdmin } from './admin-mail.js';
import { probeGroq, groqProbeHint, reviewLegalDraft, groqReviewNotes } from './ai/groq.js';
import { compareAiProviders } from './ai/compare.js';
import { aiConfigured, modelIds, fallbackTextModel, probeModel, probeHint } from './ai/gemini.js';
import { openaiConfigured, openaiModelId, probeOpenAI, openaiProbeHint } from './ai/openai.js';
import { findVerifiedLegalArticles } from './legal-bank.js';
import { generateTextWithFallback } from './ai/fallback.js';
import { ASSISTANT_SCHEMA, assistantSystemPrompt } from './ai/prompts.js';

/** GET /api/admin/ai/status ← وضعیت کلید و نتیجهٔ بررسی مدل اصلی و جایگزین */
export async function handleAdminAi(request, env, path) {
  if (path !== '/api/admin/ai/status' && path !== '/api/admin/ai/compare' && path !== '/api/admin/ai/legal-bank-test') return null;
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;
  if (path === '/api/admin/ai/compare') return compareAiProviders(request, env);
  if (path === '/api/admin/ai/legal-bank-test') return runLegalBankAiTest(request, env);
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  const geminiPrimary = modelIds(env).text;
  const geminiModels = [...new Set([geminiPrimary, fallbackTextModel(geminiPrimary)])];
  const [openai, results, groq] = await Promise.all([
    probeOpenAI(env),
    Promise.all(geminiModels.map((model) => probeModel(env, model))),
    probeGroq(env),
  ]);
  return json({
    ok: true,
    configured: openaiConfigured(env) || aiConfigured(env),
    groq: { ...groq, hint: groqProbeHint(groq) },
    models: [
      { ...openai, provider: 'openai', role: 'اصلی', hint: openaiProbeHint(openai) },
      ...results.map((result, index) => ({
        ...result,
        provider: 'gemini',
        role: index === 0 ? 'جست‌وجو، پیوست و جایگزین' : 'جایگزین دوم',
        hint: probeHint(result),
      })),
    ],
  });
}

/** POST /api/admin/ai/legal-bank-test: آزمون زندهٔ بازیابی بانک، پاسخ مدل اصلی و بازبینی Groq؛ بدون ذخیره‌سازی. */
async function runLegalBankAiTest(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const question = 'مهلت تجدیدنظرخواهی از آرای دادگاه‌های بدوی در امور حقوقی و کیفری چقدر است؟ مبدأ محاسبه مهلت، اثر واخواهی، تعطیلی روز آخر و امکان پذیرش درخواست خارج از مهلت با عذر موجه را با ذکر مستندات قانونی توضیح بده. اگر درباره مستندی مطمئن نیستی، صریحاً اعلام کن.';
  let initialArticles;
  try {
    initialArticles = await findVerifiedLegalArticles(env.DB, question);
  } catch (error) {
    console.error(JSON.stringify({ where: 'admin_ai_legal_test', stage: 'initial_bank_query', error: error?.name || 'Error' }));
    return json({ ok: false, error: 'LEGAL_BANK_QUERY_FAILED', stage: 'initial_bank_query' }, 503);
  }
  const legalContext = initialArticles.length
    ? initialArticles.map((article) => `قانون: ${article.lawTitle}\nماده ${article.articleNumber}${article.heading ? ` ـ ${article.heading}` : ''}\n${article.body}\nمنبع ثبت‌شده: ${article.sourceName || 'ثبت نشده'}${article.sourceUrl ? ` (${article.sourceUrl})` : ''}`).join('\n\n---\n\n')
    : 'در بانک قوانین، ماده مرتبطِ تأییدشده‌ای بازیابی نشد.';
  let generated;
  try {
    generated = await generateTextWithFallback(env, {
      system: assistantSystemPrompt({ mode: 'consult', docType: null, hasAttachments: false, legalContext }),
      contents: [{ role: 'user', parts: [{ text: question }] }],
      maxOutputTokens: 3000,
      timeoutMs: 45_000,
      json: true,
      schema: ASSISTANT_SCHEMA,
      plainFallback: true,
    }, { allowGroq: false });
  } catch (error) {
    console.error(JSON.stringify({ where: 'admin_ai_legal_test', stage: 'primary_model_generation', error: error?.name || 'Error', code: error?.code || undefined }));
    return json({ ok: false, error: 'GEMINI_TEST_FAILED', stage: 'gemini_generation' }, 503);
  }
  const draft = typeof generated?.data?.text === 'string' ? generated.data.text.trim() : '';
  if (!draft) return json({ ok: false, error: 'GEMINI_EMPTY_RESPONSE', stage: 'gemini_generation' }, 502);
  let answerArticles = [];
  let answerSearchFailed = false;
  try {
    answerArticles = await findVerifiedLegalArticles(env.DB, draft);
  } catch (error) {
    answerSearchFailed = true;
    console.error(JSON.stringify({ where: 'admin_ai_legal_test', stage: 'answer_bank_query', error: error?.name || 'Error' }));
  }
  const combined = [...initialArticles];
  const seen = new Set(combined.map((item) => `${item.lawTitle}::${item.articleNumber}`));
  for (const item of answerArticles) {
    const key = `${item.lawTitle}::${item.articleNumber}`;
    if (!seen.has(key)) { combined.push(item); seen.add(key); }
  }
  const reviewArticles = combined.slice(0, 8);
  let review;
  try {
    review = await reviewLegalDraft(env, { mode: 'consult', docType: null, question, draft, legalArticles: reviewArticles });
  } catch (error) {
    console.error(JSON.stringify({ where: 'admin_ai_legal_test', stage: 'groq_review', error: error?.name || 'Error' }));
    review = { status: 'review_error' };
  }
  const bankArticles = reviewArticles.slice(0, 6).map((item) => ({
    lawTitle: item.lawTitle, articleNumber: item.articleNumber, heading: item.heading || '',
    body: String(item.body || '').slice(0, 2200), sourceName: item.sourceName || '', sourceUrl: item.sourceUrl || '',
  }));
  return json({
    ok: true, saved: false, question,
    primary: { provider: generated.provider || 'unknown', status: 'ok', model: generated.model || null, text: draft },
    bank: { initialCount: initialArticles.length, answerCount: answerArticles.length,
      suppliedToGroqCount: review?.bankArticlesCount ?? 0, answerSearchFailed, articles: bankArticles },
    groq: { status: review?.status || 'unknown', model: review?.model || null,
      bankArticlesCount: review?.bankArticlesCount ?? 0, review: review?.review || null,
      details: groqReviewNotes(review) },
    note: `این آزمون هیچ داده‌ای را در پایگاه داده ذخیره نمی‌کند. پاسخ با مسیر ${generated.provider || 'مدل اصلی'} تولید شد؛ در صورت اجرای بازبینی مستقل، پیش‌نویس و مواد بازیابی‌شده به Groq ارسال می‌شوند.`,
  });
}
