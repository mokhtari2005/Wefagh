import { test, expect } from '@playwright/test';

const pages = [
  { name: 'home', url: '/?perf=home#/', ready: '.home-dashboard' },
  { name: 'regional-calculator', url: '/?perf=regional#/calculators/regional', ready: '.regional-value-tool' },
  { name: 'legal-consultation', url: '/?perf=consult#/assistant/consult', ready: '.assistant h1' },
];

async function collectMetrics(page, item, startedAt, response, readyError, failedRequests, pageErrors) {
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const rectInViewport = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    };
    const slowest = resources
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 15)
      .map((entry) => ({
        origin: new URL(entry.name).origin === location.origin ? 'same-origin' : new URL(entry.name).origin,
        url: new URL(entry.name).pathname,
        durationMs: Math.round(entry.duration),
        transferBytes: entry.transferSize || 0,
        decodedBytes: entry.decodedBodySize || 0,
      }));
    const heroImage = document.querySelector('.hero-bg');
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]));
    return {
      documentState: document.readyState,
      ttfbMs: nav ? Math.round(nav.responseStart) : null,
      domInteractiveMs: nav ? Math.round(nav.domInteractive) : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav?.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      firstContentfulPaintMs: paint['first-contentful-paint'] ?? null,
      largestContentfulPaintMs: window.__mlaLcp?.at(-1)?.startTime ? Math.round(window.__mlaLcp.at(-1).startTime) : null,
      resourceCount: resources.length,
      transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      slowest,
      initialLoadingVisible: Boolean(document.querySelector('main > p.loading')),
      deferredLoadingPlaceholders: [...document.querySelectorAll('.lazy-content-placeholder .loading')].filter(rectInViewport).length,
      heroImage: heroImage ? { complete: heroImage.complete, naturalWidth: heroImage.naturalWidth } : null,
    };
  });

  const result = {
    page: item.name,
    readyMs: Date.now() - startedAt,
    httpStatus: response?.status() ?? null,
    readySelectorVisible: await page.locator(item.ready).isVisible().catch(() => false),
    readyError,
    failedRequests,
    pageErrors,
    ...metrics,
  };
  console.log('SITE_PAGE_PERFORMANCE ' + JSON.stringify(result));
  return result;
}

async function navigateAndMeasure(page, item) {
  const startedAt = Date.now();
  const failedRequests = [];
  const pageErrors = [];
  const onRequestFailed = (request) => failedRequests.push({
    url: request.url().split('?')[0],
    resourceType: request.resourceType(),
    error: request.failure()?.errorText || 'unknown',
  });
  const onPageError = (error) => pageErrors.push(String(error).slice(0, 240));
  page.on('requestfailed', onRequestFailed);
  page.on('pageerror', onPageError);

  let response;
  let readyError = null;
  try {
    response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (response) {
      try {
        await expect(page.locator(item.ready), `محتوای واقعی صفحه ${item.name}`).toBeVisible({ timeout: 20000 });
      } catch (error) {
        readyError = String(error).slice(0, 500);
      }
    }
  } catch (error) {
    readyError = String(error).slice(0, 500);
  }

  const result = await collectMetrics(page, item, startedAt, response, readyError, failedRequests, pageErrors);
  page.off('requestfailed', onRequestFailed);
  page.off('pageerror', onPageError);
  expect(response, `صفحه ${item.name} باید پاسخ HTTP داشته باشد`).not.toBeNull();
  expect(response.status(), `پاسخ HTTP صفحه ${item.name}`).toBeLessThan(400);
  expect(result.readySelectorVisible, `محتوای واقعی صفحه ${item.name} باید نمایش داده شود`).toBe(true);
  return result;
}

test('تشخیص زمان بارگذاری صفحات اصلی سایت منتشرشده', async ({ page }) => {
  const results = [];
  for (const item of pages) results.push(await navigateAndMeasure(page, item));
  console.log('SITE_PAGE_PERFORMANCE_SUMMARY ' + JSON.stringify(results));
  expect(results).toHaveLength(pages.length);
});

test('تشخیص بارگذاری سرد صفحه اصلی در نمای موبایل و شبکه کندتر', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.__mlaLcp = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__mlaLcp.push({ startTime: entry.startTime, size: entry.size });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* Browser does not expose LCP. */ }
  });

  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 90 * 1024,
    connectionType: 'cellular4g',
  });

  const result = await navigateAndMeasure(page, {
    name: 'home-mobile-cold-4g',
    url: '/?perf=home-mobile#/',
    ready: '.home-dashboard',
  });
  console.log('SITE_MOBILE_COLD_START ' + JSON.stringify(result));
  await client.detach();
});
