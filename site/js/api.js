// فراخوانی API. همهٔ درخواست‌ها هم‌مبدأ هستند (/api) و کوکی همراه‌شان می‌شود.

// فقط نام‌های شناخته‌شدهٔ خطا برای عیب‌یابی برگردانده می‌شوند؛ پیام خام ممکن است دادهٔ حساس داشته باشد.
function safeFetchErrorType(error) {
  const name = error && typeof error.name === 'string' ? error.name : '';
  return ['TypeError', 'AbortError', 'NetworkError', 'SecurityError'].includes(name) ? name : 'OtherError';
}

function fetchFailure(error, timedOut) {
  return {
    status: 0,
    ok: false,
    data: null,
    networkError: true,
    timeoutError: timedOut,
    networkErrorType: safeFetchErrorType(error),
  };
}

export async function postJson(path, payload, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data, url: res.url, redirected: res.redirected, allow: res.headers.get('allow'), contentType: res.headers.get('content-type') };
  } catch (error) {
    return fetchFailure(error, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

/** ارسال FormData (فایل‌ها). هدر Content-Type را مرورگر با مرز (boundary) خودش می‌گذارد. */
export async function postForm(path, formData, { timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: formData,
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (error) {
    return fetchFailure(error, timedOut);
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
    try {
      data = await res.json();
    } catch {
      data = null;
    }
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
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (error) {
    return fetchFailure(error, timedOut);
  } finally {
    clearTimeout(timer);
  }
}
