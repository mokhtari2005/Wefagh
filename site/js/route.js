// تجزیهٔ hash مسیر به مسیر و پارامترهای query. خالص و قابل تست.

/**
 * @param {string} hash مثل "#/verify?token=abc"
 * @returns {{ path: string, params: Record<string,string> }}
 */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const withSlash = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const path = withSlash.replace(/\/+$/, '') || '/';
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path, params };
}
