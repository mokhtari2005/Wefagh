// فراخوانی API. همهٔ درخواست‌ها هم‌مبدأ هستند (/api) و کوکی همراه‌شان می‌شود.

// فقط نام خطا ثبت می‌شود؛ پیام خام مرورگر ممکن است دادهٔ حساس داشته باشد.
function safeFetchErrorType(error) {
  const name = error && typeof error.name === 'string' ? error.name : '';
  return ['TypeError', 'AbortError', 'NetworkError', 'SecurityError'].includes(name) ? name : 'OtherError';
}

function createRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function probeApiHealth() {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 4000);
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    return { status: response.ok ? 'reachable' : 'http_error', httpStatus: response.status };
  } catch {
    return { status: timedOut ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFailure(error, timedOut, path, probe = true, requestId = '', attempt = 1, startedAt = Date.now()) {
  const result = {
    status: 0,
    ok: false,
    data: null,
    networkError: true,
    timeoutError: timedOut,
    networkErrorType: safeFetchErrorType(error),
    networkErrorPhase: 'fetch',
    requestId,
    requestAttempt: attempt,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  };
  // فقط پس از شکست اتصال دستیار، یک GET بی‌هزینه و بدون دادهٔ پرونده اجرا می‌شود.
  if (probe && path === '/api/ai/assistant' && !timedOut) result.apiProbe = await probeApiHealth();
  return result;
}

function isRetryableNetworkFailure(result) {
  return Boolean(result?.networkError) && !result.timeoutError && result.networkErrorType === 'TypeError';
}

async function withNetworkRetries(run, networkRetries) {
  let result = await run(networkRetries === 0, 1);
  for (let i = 0; i < networkRetries && isRetryableNetworkFailure(result); i += 1) {
    await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
    result = await run(i === networkRetries - 1, i + 2);
  }
  return result;
}

export function postJson(path, payload, { timeoutMs = 15000, networkRetries = 0 } = {}) {
  const requestId = createRequestId();
  return withNetworkRetries((probe, attempt) => postJsonOnce(path, payload, timeoutMs, probe, requestId, attempt), networkRetries);
}

async function postJsonOnce(path, payload, timeoutMs, probe, requestId, attempt) {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Request-ID': requestId,
        'X-Client-Request-Attempt': String(attempt),
      },
      body: JSON.stringify(payload ?? {}),
      cache: 'no-store',
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return {
      status: res.status, ok: res.ok, data, url: res.url, redirected: res.redirected,
      allow: res.headers.get('allow'), contentType: res.headers.get('content-type'),
      requestId: res.headers.get('x-request-id') || data?.requestId || requestId,
      requestAttempt: attempt,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return await fetchFailure(error, timedOut, path, probe, requestId, attempt, startedAt);
  } finally {
    clearTimeout(timer);
  }
}

/** ارسال FormData؛ هدر Content-Type را مرورگر با boundary صحیح می‌سازد. */
export function postForm(path, formData, { timeoutMs = 60000, networkRetries = 0 } = {}) {
  const requestId = createRequestId();
  return withNetworkRetries((probe, attempt) => postFormOnce(path, formData, timeoutMs, probe, requestId, attempt), networkRetries);
}

async function postFormOnce(path, formData, timeoutMs, probe, requestId, attempt) {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Client-Request-ID': requestId,
        'X-Client-Request-Attempt': String(attempt),
      },
      body: formData,
      cache: 'no-store',
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return {
      status: res.status, ok: res.ok, data,
      requestId: res.headers.get('x-request-id') || data?.requestId || requestId,
      requestAttempt: attempt,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    return await fetchFailure(error, timedOut, path, probe, requestId, attempt, startedAt);
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson(path, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, data };
  } catch (error) {
    return fetchFailure(error, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth() {
  const res = await getJson('/api/health');
  return res.ok ? res.data : null;
}

/** PATCH/DELETE با همان قرارداد پاسخ getJson/postJson. */
export async function sendJson(method, path, payload, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const init = {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    };
    if (payload !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(payload);
    }
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, data };
  } catch (error) {
    return fetchFailure(error, timedOut);
  } finally {
    clearTimeout(timer);
  }
}
