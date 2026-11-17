// تنظیم قابل‌کنترل ثبت‌نام؛ داده‌های شخصی همچنان فقط با حساب کاربری قابل دسترسی‌اند.
import { json, readJsonBody } from './http.js';
import { requireAdmin } from './admin.js';

export async function registrationRequired(env) {
  if (!env.DB) return true;
  try {
    const row = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'registration_required'").first();
    return row ? row.setting_value !== 'false' : true;
  } catch {
    return true;
  }
}

export async function handleAccess(request, env, path) {
  if (path === '/api/access-settings') {
    if (request.method !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    return json({ ok: true, registrationRequired: await registrationRequired(env) });
  }
  if (path !== '/api/admin/settings/access') return null;
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const access = await requireAdmin(request, env);
  if (access.response) return access.response;
  if (request.method === 'GET') {
    return json({ ok: true, registrationRequired: await registrationRequired(env) });
  }
  if (request.method !== 'PUT') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, PUT' });
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  if (typeof parsed.body?.registrationRequired !== 'boolean') {
    return json({ ok: false, error: 'VALIDATION_FAILED', field: 'registrationRequired' }, 422);
  }
  const value = String(parsed.body.registrationRequired);
  await env.DB.prepare("INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ('registration_required', ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at").bind(value).run();
  return json({ ok: true, registrationRequired: parsed.body.registrationRequired });
}
