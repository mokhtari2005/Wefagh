// پایش سمت مرورگر: فقط کد خطا و مسیر ثبت می‌شود؛ متن فرم، توکن، ایمیل و stack trace ارسال نمی‌شوند.
const COMPONENTS = [
  [/regional|map/i, 'regional-map'], [/voice|speech/i, 'voice-typing'], [/assistant|ai/i, 'assistant'],
  [/academy|exam/i, 'academy'], [/calendar|deadline/i, 'calendar'], [/case/i, 'cases'], [/media/i, 'media'],
  [/calc/i, 'calculator'], [/auth|login|register/i, 'auth'],
];
function componentFor(value) {
  const text = String(value || '');
  return COMPONENTS.find(([pattern]) => pattern.test(text))?.[1] || 'site';
}
function safeRoute() {
  return (location.hash || '#/').split('?')[0].replace(/^#/, '').slice(0, 100) || '/';
}
let reporting = false;
function report(payload) {
  if (reporting || !navigator.onLine) return;
  reporting = true;
  const body = JSON.stringify({ ...payload, route: safeRoute() });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/diagnostics/report', blob);
    } else {
      fetch('/api/diagnostics/report', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* پایش نباید عملکرد اصلی سایت را مختل کند */ }
  setTimeout(() => { reporting = false; }, 1500);
}

export function installDiagnostics() {
  if (window.__wefaghDiagnosticsInstalled) return;
  window.__wefaghDiagnosticsInstalled = true;
  window.addEventListener('error', (event) => {
    const source = event.filename ? event.filename.split('/').pop() : '';
    report({ category: 'javascript', component: componentFor(source), errorCode: 'UNCAUGHT_ERROR' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report({ category: 'promise', component: componentFor(reason?.name), errorCode: 'UNHANDLED_REJECTION' });
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
    const isReport = url.includes('/api/diagnostics/report');
    const component = componentFor(url);
    const method = String(args[1]?.method || input?.method || 'GET').toUpperCase();
    const canRetry = (method === 'GET' || method === 'HEAD') && isApi && !isReport;
    let lastError;
    for (let attempt = 0; attempt <= (canRetry ? 2 : 0); attempt += 1) {
      try {
        const response = await originalFetch(...args);
        const retryable = response.status === 429 || [500, 502, 503, 504].includes(response.status);
        if (retryable && canRetry && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2000) : 350 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        if (isApi && !isReport && retryable) report({ category: 'api', component, errorCode: response.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR', httpStatus: response.status });
        return response;
      } catch (error) {
        lastError = error;
        if (!canRetry || attempt >= 2 || error?.name === 'AbortError') break;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    if (isApi && !isReport) report({ category: 'network', component, errorCode: lastError?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_FAILURE' });
    throw lastError;
  };
}
