import { test, expect } from '@playwright/test';

async function snapshot(page, label, startedAt, responses) {
  const browser = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((x) => [x.name, Math.round(x.startTime)]));
    const resources = performance.getEntriesByType('resource');
    const slow = resources
      .filter((x) => ['script', 'stylesheet', 'font', 'image'].includes(x.initiatorType))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 12)
      .map((x) => ({
        path: new URL(x.name).pathname,
        type: x.initiatorType,
        durationMs: Math.round(x.duration),
        transferBytes: x.transferSize || 0,
      }));
    const hero = document.querySelector('.hero-bg');
    return {
      readyState: document.readyState,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      domInteractiveMs: nav ? Math.round(nav.domInteractive) : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav?.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      fcpMs: paint['first-contentful-paint'] ?? null,
      lcpMs: window.__mlaLcp?.at(-1)?.startTime ? Math.round(window.__mlaLcp.at(-1).startTime) : null,
      resourceCount: resources.length,
      totalTransferBytes: resources.reduce((n, x) => n + (x.transferSize || 0), 0),
      fontsStatus: document.fonts?.status || 'unsupported',
      heroImage: hero ? { complete: hero.complete, naturalWidth: hero.naturalWidth } : null,
      slowResources: slow,
    };
  });
  const result = { label, readyMs: Date.now() - startedAt, apiResponses: responses, ...browser };
  console.log('SITE_REAL_READINESS ' + JSON.stringify(result));
  return result;
}

async function trackApiResponses(page) {
  const responses = [];
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) {
      responses.push({ path: url.pathname, status: response.status(), atMs: Math.round(response.request().timing().responseEnd) });
    }
  });
  return responses;
}

test('صفحهٔ نخست تا آماده‌شدن تصویر شاخص و فونت‌ها — دسکتاپ', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.__mlaLcp = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__mlaLcp.push({ startTime: entry.startTime, size: entry.size });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  });
  const startedAt = Date.now();
  const responses = await trackApiResponses(page);
  const response = await page.goto('/?real-readiness=home-desktop#/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator('.home-dashboard .hero-banner h1')).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const image = document.querySelector('.hero-bg');
    if (image && !image.complete) await image.decode();
  });
  const result = await snapshot(page, 'home-desktop-full-visual-readiness', startedAt, responses);
  expect(result.heroImage?.naturalWidth).toBeGreaterThan(0);
});

test('صفحهٔ نخست تا آماده‌شدن محتوای اصلی — موبایل و 4G', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.__mlaLcp = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__mlaLcp.push({ startTime: entry.startTime, size: entry.size });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  });
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 200 * 1024,
    uploadThroughput: 90 * 1024, connectionType: 'cellular4g',
  });
  const startedAt = Date.now();
  const responses = await trackApiResponses(page);
  const response = await page.goto('/?real-readiness=home-mobile#/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator('.home-dashboard .hero-banner h1')).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const image = document.querySelector('.hero-bg');
    if (image && !image.complete) await image.decode();
  });
  const result = await snapshot(page, 'home-mobile-4g-full-visual-readiness', startedAt, responses);
  expect(result.readyMs).toBeLessThan(15000);
  await client.detach();
});

test('صفحهٔ دستیار: منوی اصلی و آماده‌شدن مشاوره و APIهای دسترسی', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const menuStart = Date.now();
  const menuResponses = await trackApiResponses(page);
  const menuResponse = await page.goto('/?real-readiness=assistant-menu#/assistant', { waitUntil: 'domcontentloaded', timeout: 30000 });
  expect(menuResponse?.status()).toBeLessThan(400);
  await expect(page.locator('.assistant-document-menu .assistant-consult-card')).toBeVisible({ timeout: 15000 });
  const menuResult = await snapshot(page, 'assistant-menu-ready', menuStart, menuResponses);
  console.log('SITE_ASSISTANT_MENU ' + JSON.stringify(menuResult));

  const apiResponses = [];
  page.on('response', async (response) => {
    const path = new URL(response.url()).pathname;
    if (['/api/me', '/api/ai/status', '/api/access-settings'].includes(path)) {
      apiResponses.push({ path, status: response.status(), timing: response.request().timing() });
    }
  });
  const consultStart = Date.now();
  const consultResponse = await page.goto('/?real-readiness=assistant-consult#/assistant/consult', { waitUntil: 'domcontentloaded', timeout: 30000 });
  expect(consultResponse?.status()).toBeLessThan(400);
  await expect(page.locator('.assistant h1')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.assistant .ai-shell, .assistant .notice')).toBeVisible({ timeout: 20000 });
  const consultState = await page.evaluate(() => ({
    workspaceReady: Boolean(document.querySelector('.assistant .ai-shell')),
    loginRequired: Boolean(document.querySelector('.assistant .notice a[href="#/account"]')),
    composerVisible: Boolean(document.querySelector('.assistant .ai-composer .ai-input')),
  }));
  const result = await snapshot(page, 'assistant-consult-access-and-workspace', consultStart, apiResponses.map((x) => ({
    path: x.path, status: x.status,
    durationMs: Math.round(x.timing.responseEnd - x.timing.startTime),
  })));
  console.log('SITE_ASSISTANT_CONSULT_STATE ' + JSON.stringify({ ...result, ...consultState }));
  expect(consultState.workspaceReady || consultState.loginRequired).toBe(true);
});
