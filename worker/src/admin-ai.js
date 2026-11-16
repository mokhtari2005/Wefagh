// تشخیص هوش مصنوعی برای مدیر: مدل‌های تنظیم‌شده را با یک درخواست کوچک می‌سنجد. مقدار کلید یا متن پاسخ هرگز برنمی‌گردد.
import { json } from './http.js';
import { requireMailAdmin } from './admin-mail.js';
import { aiConfigured, modelIds, probeModel, probeHint } from './ai/gemini.js';

const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

/** GET /api/admin/ai/status ← وضعیت کلید و نتیجهٔ بررسی مدل اصلی و جایگزین */
export async function handleAdminAi(request, env, path) {
  if (path !== '/api/admin/ai/status') return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;
  const primary = modelIds(env).text;
  const models = [...new Set([primary, FALLBACK_MODEL])];
  const results = await Promise.all(models.map((m) => probeModel(env, m)));
  return json({
    ok: true,
    configured: aiConfigured(env),
    models: results.map((r) => ({ ...r, role: r.model === primary ? 'اصلی' : 'جایگزین', hint: probeHint(r) })),
  });
}
