import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMapTiles } from '../worker/src/map-tiles.js';

test('درخواست کاشی نقشه به سرویس پایه منتقل و با هدر تصویر بازگردانده می‌شود', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async (url) => {
    requested = String(url);
    return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
  };
  try {
    const response = await handleMapTiles(new Request('https://mokhtari.ir/api/map/tiles/13/5142/3380.png'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/png/);
    assert.match(response.headers.get('cache-control'), /max-age=86400/);
    assert.match(requested, /basemaps\.cartocdn\.com/);
  } finally { globalThis.fetch = originalFetch; }
});

test('مختصات خارج از محدوده کاشی پیش از تماس با سرویس بیرونی رد می‌شود', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not fetch'); };
  try {
    const response = await handleMapTiles(new Request('https://mokhtari.ir/api/map/tiles/4/16/0.png'));
    assert.equal(response.status, 400);
  } finally { globalThis.fetch = originalFetch; }
});

test('روش‌های غیر از GET و HEAD پذیرفته نمی‌شوند', async () => {
  const response = await handleMapTiles(new Request('https://mokhtari.ir/api/map/tiles/13/1/1.png', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
