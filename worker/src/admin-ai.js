// تشخیص هوش مصنوعی برای مدیر: مدل‌های تنظیم‌شده را با یک درخواست کوچک می‌سنجد. مقدار کلید یا متن پاسخ هرگز برنمی‌گردد.
import { json } from './http.js';
import { requireMailAdmin } from './admin-mail.js';
import { probeGroq, groqProbeHint } from './ai/groq.js';
import { compareAiProviders } from './ai/compare.js';
import { aiConfigured, modelIds, fallbackTextModel, probeModel, probeHint } from './ai/gemini.js';

/** GET /api/admin/ai/status ← وضعیت کلید و نتیجهٔ بررسی مدل اصلی و جایگزین */
export async function handleAdminAi(request, env, path) {
  if (path !== '/api/admin/ai/status' && path !== '/api/admin/ai/compare') return null;
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;
  if (path === '/api/admin/ai/compare') return compareAiProviders(request, env);
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  const primary = modelIds(env).text;
  const models = [...new Set([primary, fallbackTextModel(primary)])];
  const [results, groq] = await Promise.all([Promise.all(models.map((m) => probeModel(env, m))), probeGroq(env)]);
  return json({
    ok: true,
    configured: aiConfigured(env),
    groq: { ...groq, hint: groqProbeHint(groq) },
    models: results.map((r) => ({ ...r, role: r.model === primary ? 'اصلی' : 'جایگزین', hint: probeHint(r) })),
  });
}
