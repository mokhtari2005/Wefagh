// فراخوانی API. همهٔ درخواست‌ها هم‌مبدأ هستند (/api) و کوکی همراه‌شان می‌شود.

export async function postJson(path, payload, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: null, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth() {
  try {
    const res = await fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
