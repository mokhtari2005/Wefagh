// آزمون سلامت زنجیرهٔ عیب‌یابی؛ بدون درج رخداد آزمایشی، ساخت شاخه یا ایجاد PR.
import { json } from './http.js';
import { requireMailAdmin } from './admin-mail.js';
import { aiConfigured, modelIds, probeModel, probeHint } from './ai/gemini.js';
import { probeOpenAI, openaiProbeHint } from './ai/openai.js';

const OWNER = 'mokhtari2005';
const REPOSITORY = 'Wefagh';
const API = 'https://api.github.com';
const SOURCE_PROBE = 'site/js/diagnostics.js';

async function githubWriteProbe(env) {
  const token = env.GH_REPAIR_TOKEN.trim();
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'Mokhtari-Law-Academy-Diagnostics',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
  const request = async (path, method = 'GET', body) => {
    const response = await (env.fetchImpl || fetch)(`${API}${path}`, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text().catch(() => '');
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { /* پاسخ غیر JSON */ }
    if (!response.ok) {
      const error = new Error('GITHUB_WRITE_PROBE_FAILED');
      error.status = response.status;
      error.githubMessage = String(data?.message || raw || '').replaceAll(token, '[پنهان]').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').slice(0, 180);
      throw error;
    }
    return data;
  };
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const branch = `diagnostics/write-probe-${id}`;
  const filePath = `.github/diagnostics-write-tests/${id}.txt`;
  let pullRequestNumber = 0;
  let branchCreated = false;
  let pullRequestClosed = false;
  let branchDeleted = false;
  try {
    const main = await request(`/repos/${OWNER}/${REPOSITORY}/git/ref/heads/main`);
    await request(`/repos/${OWNER}/${REPOSITORY}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: main.object.sha });
    branchCreated = true;
    await request(`/repos/${OWNER}/${REPOSITORY}/contents/${filePath}`, 'PUT', {
      message: 'Test GitHub write access for diagnostics (temporary)',
      content: btoa(`Temporary diagnostics write-access probe. ID: ${id}. This file is removed with its branch.\\n`),
      branch,
    });
    const pr = await request(`/repos/${OWNER}/${REPOSITORY}/pulls`, 'POST', {
      title: `[Diagnostics Test] GitHub write access ${id}`,
      head: branch,
      base: 'main',
      body: 'Temporary automated permission test. This PR is immediately closed and its branch deleted; it contains no production changes.',
    });
    pullRequestNumber = pr.number;
    await request(`/repos/${OWNER}/${REPOSITORY}/pulls/${pullRequestNumber}`, 'PATCH', { state: 'closed' });
    pullRequestClosed = true;
    await request(`/repos/${OWNER}/${REPOSITORY}/git/refs/heads/${branch}`, 'DELETE');
    branchDeleted = true;
    return { ok: true, pullRequestNumber, pullRequestUrl: pr.html_url, branchDeleted, pullRequestClosed };
  } catch (error) {
    if (pullRequestNumber && !pullRequestClosed) {
      try { await request(`/repos/${OWNER}/${REPOSITORY}/pulls/${pullRequestNumber}`, 'PATCH', { state: 'closed' }); pullRequestClosed = true; } catch { /* گزارش وضعیت پاک‌سازی در خروجی */ }
    }
    if (branchCreated && (!pullRequestNumber || pullRequestClosed)) {
      try { await request(`/repos/${OWNER}/${REPOSITORY}/git/refs/heads/${branch}`, 'DELETE'); branchDeleted = true; } catch { /* گزارش وضعیت پاک‌سازی در خروجی */ }
    }
    error.pullRequestNumber = pullRequestNumber;
    error.pullRequestClosed = pullRequestClosed;
    error.branchDeleted = branchDeleted;
    throw error;
  }
}


export function validateSyntheticDiagnostic(payload) {
  return Boolean(payload
    && payload.category === 'javascript'
    && payload.component === 'site'
    && payload.route === '/__health_test__'
    && payload.errorCode === 'SELF_TEST'
    && payload.synthetic === true);
}

export async function githubRead(env, path) {
  const token = env.GH_REPAIR_TOKEN.trim();
  const response = await (env.fetchImpl || fetch)(`${API}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'Mokhtari-Law-Academy-Diagnostics',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let message = '';
    try {
      const body = JSON.parse(raw);
      if (typeof body?.message === 'string') message = body.message;
    } catch { message = raw; }
    const safe = (value) => String(value || '')
      .replaceAll(token, '[پنهان]')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 240);
    const error = new Error('GITHUB_READ_FAILED');
    error.status = response.status;
    error.path = path;
    error.githubMessage = safe(message);
    error.requestId = safe(response.headers.get('x-github-request-id'));
    error.rateLimitRemaining = safe(response.headers.get('x-ratelimit-remaining'));
    error.rateLimitReset = safe(response.headers.get('x-ratelimit-reset'));
    error.rateLimitResource = safe(response.headers.get('x-ratelimit-resource'));
    error.retryAfter = safe(response.headers.get('retry-after'));
    error.oauthScopes = safe(response.headers.get('x-oauth-scopes'));
    error.acceptedScopes = safe(response.headers.get('x-accepted-oauth-scopes'));
    error.githubSso = safe(response.headers.get('x-github-sso'));
    throw error;
  }
  return response.json();
}

export async function handleDiagnosticSelfTest(request, env, path) {
  if (path === '/api/admin/diagnostics/write-test') {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    const access = await requireMailAdmin(request, env);
    if (access.response) return access.response;
    if (!env.GH_REPAIR_TOKEN || env.GH_REPAIR_TOKEN.trim().length < 20) return json({ ok: false, error: 'GITHUB_TOKEN_NOT_CONFIGURED' }, 503);
    try {
      const result = await githubWriteProbe(env);
      return json({ ...result, message: 'ساخت شاخه، ثبت فایل آزمایشی، ایجاد Pull Request، بستن PR و حذف شاخه با موفقیت انجام شد. هیچ تغییری روی main ثبت نشد.' });
    } catch (error) {
      return json({ ok: false, status: error?.status || 0, githubMessage: error?.githubMessage || '', pullRequestNumber: error?.pullRequestNumber || null, pullRequestClosed: Boolean(error?.pullRequestClosed), branchDeleted: Boolean(error?.branchDeleted), message: 'آزمون نوشتن GitHub کامل نشد؛ وضعیت پاک‌سازی در همین پاسخ مشخص شده است.' }, 502);
    }
  }
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

  const openaiProbe = await probeOpenAI(env);
  checks.push({
    id: 'openai',
    label: 'اتصال و پاسخ GPT',
    ok: openaiProbe.ok,
    detail: openaiProbe.ok
      ? `مدل ${openaiProbe.model} پاسخ داد (${openaiProbe.ms} میلی‌ثانیه).`
      : openaiProbeHint(openaiProbe),
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
    checks.push({ id: 'github-read', label: 'دسترسی GitHub به مخزن', ok: false, detail: 'Secret با نام GH_REPAIR_TOKEN تنظیم نشده است یا مقدار آن کوتاه است.' });
  } else {
    try {
      const repository = await githubRead(env, `/repos/${OWNER}/${REPOSITORY}`);
      const source = await githubRead(env, `/repos/${OWNER}/${REPOSITORY}/contents/${SOURCE_PROBE}?ref=main`);
      checks.push({
        id: 'github-read',
        label: 'دسترسی GitHub به مخزن',
        ok: Boolean(repository?.full_name === `${OWNER}/${REPOSITORY}` && source?.sha),
        detail: 'مخزن و فایل کد اصلی با توکن فعلی قابل خواندن هستند.',
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 0;
      const reason = typeof error?.githubMessage === 'string' && error.githubMessage
        ? ` پاسخ GitHub: «${error.githubMessage}».`
        : '';
      const endpoint = error?.path ? ` مسیر ردشده: ${error.path}.` : '';
      const request = error?.requestId ? ` شناسه درخواست: ${error.requestId}.` : '';
      const rate = error?.rateLimitRemaining === '0'
        ? ` سهمیه ${error?.rateLimitResource || 'API'} تمام شده است؛ زمان بازنشانی: ${error.rateLimitReset || 'نامشخص'}.`
        : '';
      const retry = error?.retryAfter ? ` زمان انتظار پیشنهادی GitHub: ${error.retryAfter} ثانیه.` : '';
      const sso = error?.githubSso ? ' GitHub محدودیت SSO را در پاسخ اعلام کرده است؛ دسترسی SSO توکن را بررسی کنید.' : '';
      const scopes = error?.oauthScopes ? ` دامنه‌های توکن: ${error.oauthScopes}.` : '';
      const accepted = error?.acceptedScopes ? ` دامنه‌های پذیرفته‌شده برای این مسیر: ${error.acceptedScopes}.` : '';
      const explanation = status === 401
        ? 'کد 401: GitHub توکن را معتبر نمی‌شناسد؛ مقدار Secret، فعال‌بودن توکن و کپی‌شدن کامل آن را بررسی کنید.'
        : status === 403
          ? 'کد 403: GitHub دسترسی این درخواست را رد کرده است. علت دقیق در متن پاسخ یا سرآیندهای زیر آمده است.'
          : status === 404
            ? 'کد 404: مخزن یا فایل آزمون پیدا نشد؛ دسترسی مخزن و نام مسیر را بررسی کنید.'
            : status
              ? `GitHub با کد HTTP ${status} پاسخ داد.`
              : 'ارتباط با GitHub برقرار نشد؛ تنظیمات شبکه و دسترسی خروجی Worker را بررسی کنید.';
      checks.push({
        id: 'github-read',
        label: 'دسترسی GitHub به مخزن',
        ok: false,
        detail: `${explanation}${endpoint}${reason}${rate}${retry}${sso}${scopes}${accepted}${request}`,
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
