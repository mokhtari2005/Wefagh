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
    try {
      const response = await originalFetch(...args);
      if (isApi && !isReport && (response.status === 429 || response.status >= 500)) {
        report({ category: 'api', component, errorCode: response.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR', httpStatus: response.status });
      }
      return response;
    } catch (error) {
      if (isApi && !isReport) report({ category: 'network', component, errorCode: error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_FAILURE' });
      throw error;
    }
  };
}
