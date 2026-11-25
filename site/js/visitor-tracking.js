// ثبت حضور بازدیدکننده؛ شناسه تصادفی و ناشناس، بدون دسترسی به اطلاعات حساب.
const KEY = 'wefagh_visitor_session_v1';
function sessionId() {
  try {
    let value = sessionStorage.getItem(KEY);
    if (!value || !/^[a-f0-9-]{24,64}$/i.test(value)) {
      value = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,'0')).join('');
      sessionStorage.setItem(KEY, value);
    }
    return value;
  } catch { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'anonymous-session-000000000000'; }
}
export function installVisitorTracking() {
  const id = sessionId();
  let lastPath = '';
  const ping = () => {
    const path = location.hash ? location.hash.slice(1).split('?')[0] : '/';
    if (document.visibilityState === 'hidden') return;
    if (path !== lastPath) lastPath = path;
    fetch('/api/analytics/heartbeat', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id, path })
    }).catch(() => {});
  };
  ping();
  window.addEventListener('hashchange', ping);
  document.addEventListener('visibilitychange', ping);
  // آنلاین‌بودن با بازهٔ دو دقیقه‌ای سرور سازگار است؛ heartbeat هر ۶۰ ثانیه کافی است.
  window.setInterval(ping, 60000);
}
