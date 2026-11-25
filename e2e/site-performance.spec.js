import { test, expect } from '@playwright/test';

const pages = [
  { name: 'home', url: '/?perf=home#/', ready: '#hero-title' },
  { name: 'regional-calculator', url: '/?perf=regional#/calculators/regional', ready: '.regional-value-tool' },
  { name: 'legal-consultation', url: '/?perf=consult#/assistant/consult', ready: '.assistant h1' },
];

test('تشخیص زمان بارگذاری صفحات اصلی سایت منتشرشده', async ({ page }) => {
  const results = [];

  for (const item of pages) {
    const startedAt = Date.now();
    const failedRequests = [];
    const pageErrors = [];
    const onRequestFailed = (request) => {
      failedRequests.push({
        url: request.url().split('?')[0],
        resourceType: request.resourceType(),
        error: request.failure()?.errorText || 'unknown',
      });
    };
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

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
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
      return {
        documentState: document.readyState,
        ttfbMs: nav ? Math.round(nav.responseStart) : null,
        domInteractiveMs: nav ? Math.round(nav.domInteractive) : null,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadEventMs: nav?.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
        resourceCount: resources.length,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        slowest,
        loadingMessageVisible: Boolean([...document.querySelectorAll('.loading')].find((el) => el.getClientRects().length)),
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
    results.push(result);
    console.log('SITE_PAGE_PERFORMANCE ' + JSON.stringify(result));

    page.off('requestfailed', onRequestFailed);
    page.off('pageerror', onPageError);
    expect(response, `صفحه ${item.name} باید پاسخ HTTP داشته باشد`).not.toBeNull();
    expect(response.status(), `پاسخ HTTP صفحه ${item.name}`).toBeLessThan(400);
    expect(result.readySelectorVisible, `محتوای واقعی صفحه ${item.name} باید نمایش داده شود`).toBe(true);
  }

  console.log('SITE_PAGE_PERFORMANCE_SUMMARY ' + JSON.stringify(results));
  expect(results).toHaveLength(pages.length);
});
