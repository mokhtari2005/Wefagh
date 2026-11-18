// Same-origin raster tile proxy for the regional property map.
// Client requests are constrained to valid Web Mercator tile coordinates.
const TILE_HOSTS = [
  // OpenStreetMap public raster tiles are the primary source. CARTO's
  // current tile endpoint can return an API KEY REQUIRED watermark.
  (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
];

const TILE_HEADERS = {
  'User-Agent': 'MokhtariLawAcademyMap/1.0 (+https://mokhtari.ir)',
  'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
};

export async function handleMapTiles(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  if (parts.length !== 7 || parts[1] !== 'api' || parts[2] !== 'map' || parts[3] !== 'tiles' || !/^\d{1,2}$/.test(parts[4]) || !/^\d+$/.test(parts[5]) || !/^\d+\.png$/.test(parts[6])) {
    return new Response('Not found', { status: 404 });
  }
  const z = Number(parts[4]), x = Number(parts[5]), y = Number(parts[6].slice(0, -4));
  const limit = 2 ** z;
  if (z < 1 || z > 19 || x < 0 || y < 0 || x >= limit || y >= limit) {
    return new Response('Invalid tile coordinates', { status: 400 });
  }

  for (const makeUrl of TILE_HOSTS) {
    try {
      const upstream = await fetch(makeUrl(z, x, y), {
        method: request.method,
        headers: TILE_HEADERS,
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      if (!upstream.ok) continue;
      const type = upstream.headers.get('content-type') || '';
      if (!type.toLowerCase().startsWith('image/')) continue;
      const headers = new Headers({
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
      });
      const cacheTag = upstream.headers.get('etag');
      if (cacheTag) headers.set('ETag', cacheTag);
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
    } catch (_) {
      // Try the next provider; the browser only ever talks to this origin.
    }
  }
  return new Response('Map tile providers are unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
