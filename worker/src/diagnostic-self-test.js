// آزمون سلامت زنجیرهٔ عیب‌یابی؛ بدون درج رخداد آزمایشی، ساخت شاخه یا ایجاد PR.
import { json } from './http.js';
import { requireMailAdmin } from './admin-mail.js';
import { aiConfigured, modelIds, probeModel, probeHint } from './ai/gemini.js';

const OWNER = 'mokhtari2005';
const REPOSITORY = 'Wefagh';
const API = 'https://api.github.com';
const SOURCE_PROBE = 'site/js/diagnostics.js';

export function validateSyntheticDiagnostic(payload) {
  return Boolean(payload
    && payload.category === 'javascript'
    && payload.component === 'site'
    && payload.route === '/__health_test__'
    && payload.errorCode === 'SELF_TEST'
    && payload.synthetic === true);
}

async function githubRead(env, path) {
  const response = await (env.fetchImpl || fetch)(`${API}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GH_REPAIR_TOKEN.trim()}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const error = new Error('GITHUB_READ_FAILED');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function handleDiagnosticSelfTest(request, env, path) {
  if (path !== '/api/admin/diagnostics/self-test') return null;
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
  const access = await requireMailAdmin(request, env);
  if (access.response) return access.response;

  const checks = [];
  const synthetic = {
    category: 'javascript',
    component: 'site',
    route: '/__health_test__',
    errorCode: 'SELF_TEST',
    synthetic: true,
  };
  checks.push({
    id: 'report-validation',
    label: 'اعتبارسنجی گزارش آزمایشی',
    ok: validateSyntheticDiagnostic(synthetic),
    detail: 'ساختار گزارش معتبر است؛ هیچ رکوردی در بانک اطلاعاتی ثبت نشد.',
  });
  checks.push({
    id: 'database',
    label: 'اتصال بانک گزارش‌ها',
    ok: Boolean(env.DB),
    detail: env.DB ? 'اتصال D1 در محیط Worker در دسترس است.' : 'اتصال D1 برای Worker تعریف نشده است.',
  });

  if (aiConfigured(env)) {
    const model = modelIds(env).text;
    const probe = await probeModel(env, model);
    checks.push({
      id: 'gemini',
      label: 'اتصال و پاسخ Gemini',
      ok: probe.ok,
      detail: probe.ok ? `مدل ${probe.model} پاسخ داد (${probe.ms} میلی‌ثانیه).` : `${probeHint(probe)}${probe.httpStatus ? ` کد HTTP: ${probe.httpStatus}.` : ''}`,
    });
  } else {
    checks.push({ id: 'gemini', label: 'اتصال و پاسخ Gemini', ok: false, detail: 'Secret با نام GEMINI_API_KEY تنظیم نشده است.' });
  }

  if (!env.GH_REPAIR_TOKEN || env.GH_REPAIR_TOKEN.trim().length < 20) {
    checks.push({ id: 'github-read', label: 'دسترسی GitHub به مخزن', ok: false, detail: 'Secret با نام GH_REPAIR_TOKEN تنظیم نشده است.' });
  } else {
    try {
      const [repository, source] = await Promise.all([
        githubRead(env, `/repos/${OWNER}/${REPOSITORY}`),
        githubRead(env, `/repos/${OWNER}/${REPOSITORY}/contents/${SOURCE_PROBE}?ref=main`),
      ]);
      checks.push({
        id: 'github-read',
        label: 'دسترسی GitHub به مخزن',
        ok: Boolean(repository?.full_name === `${OWNER}/${REPOSITORY}` && source?.sha),
        detail: 'مخزن و فایل کد اصلی با توکن فعلی قابل خواندن هستند.',
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 0;
      checks.push({
        id: 'github-read',
        label: 'دسترسی GitHub به مخزن',
        ok: false,
        detail: status === 401 || status === 403
          ? 'GitHub دسترسی توکن را رد کرد؛ مجوزهای مخزن و Secret را بررسی کنید.'
          : status === 404
            ? 'مخزن یا فایل آزمون پیدا نشد؛ دسترسی Contents را بررسی کنید.'
            : 'ارتباط با GitHub برقرار نشد؛ بعداً دوباره تلاش کنید.',
      });
    }
  }

  const passed = checks.filter((item) => item.ok).length;
  return json({
    ok: checks.every((item) => item.ok),
    passed,
    total: checks.length,
    checks,
    note: 'این آزمون فقط اعتبارسنجی و دسترسی خواندن را بررسی می‌کند؛ هیچ گزارش واقعی، شاخه یا Pull Request ایجاد نمی‌شود و مجوز نوشتن GitHub را اثبات نمی‌کند.',
  });
}
