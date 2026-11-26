import { test, expect } from '@playwright/test';

test('منوی دستیار بدون بارگذاری ماژول کامل گفت‌وگو نمایش داده می‌شود', async ({ page }) => {
  const loadedScripts = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.js')) loadedScripts.push(url.pathname);
  });
  await page.goto('/?light-assistant-menu=1#/assistant', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.assistant-document-menu .assistant-consult-card')).toBeVisible({ timeout: 7000 });
  expect(loadedScripts).not.toContain('/js/assistant.js');
  expect(loadedScripts).toContain('/js/assistant-forms.js');
  expect(loadedScripts).toContain('/js/assistant-config.js');
});

test('تصویر شاخص و فونت اصلی صفحهٔ نخست از HTML پیش‌بارگذاری می‌شوند', async ({ page }) => {
  await page.goto('/?critical-home-assets=1#/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.home-dashboard .hero-banner h1')).toBeVisible({ timeout: 7000 });
  await expect(page.locator('link[rel="preload"][as="image"][href*="legal-hero.webp"]')).toHaveCount(1);
  await expect(page.locator('link[rel="preload"][as="font"][href*="Vazirmatn-UI-FD-Regular.woff2"]')).toHaveCount(1);
  const timings = await page.evaluate(() => {
    const get = (path) => performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.startTime ?? null;
    return { heroStart: get('/assets/images/legal-hero.webp'), appStart: get('/js/app.js') };
  });
  expect(timings.heroStart).not.toBeNull();
  expect(timings.appStart).not.toBeNull();
  expect(timings.heroStart).toBeLessThan(timings.appStart);
});
