import { test, expect } from '@playwright/test';

const pages = [
  { name: 'home', url: '/#/', ready: '#hero-title' },
  { name: 'regional-calculator', url: '/#/calculators/regional', ready: '.regional-value-tool' },
  { name: 'legal-consultation', url: '/#/assistant/consult', ready: '.ai-workbench-intro h1' },
];

test('اندازه‌گیری زمان آماده‌شدن واقعی صفحات اصلی در سایت منتشرشده', async ({ page }) => {
  const results = [];

  for (const item of pages) {
    const startedAt = Date.now();
    const response = await page.goto(item.url, { waitUntil: 'domcontentloaded' });
    expect(response, `صفحه ${item.name} باید پاسخ HTTP داشته باشد`).not.toBeNull();
    expect(response.status(), `پاسخ HTTP صفحه ${item.name}`).toBeLessThan(400);
    await expect(page.locator(item.ready), `محتوای واقعی صفحه ${item.name} باید نمایش داده شود`).toBeVisible({ timeout: 15000 });

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const slowest = resources
        .filter((entry) => entry.name.startsWith(location.origin))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 8)
        .map((entry) => ({
          url: new URL(entry.name).pathname,
          durationMs: Math.round(entry.duration),
          transferBytes: entry.transferSize || 0,
          decodedBytes: entry.decodedBodySize || 0,
        }));
      return {
        ttfbMs: Math.round(nav.responseStart),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadEventMs: Math.round(nav.loadEventEnd),
        resourceCount: resources.length,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        slowest,
      };
    });

    results.push({
      page: item.name,
      readyMs: Date.now() - startedAt,
      httpStatus: response.status(),
      ...metrics,
    });
  }

  console.log('SITE_PAGE_PERFORMANCE ' + JSON.stringify(results));
  expect(results).toHaveLength(pages.length);
});
