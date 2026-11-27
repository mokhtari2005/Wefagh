import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`میان‌برهای آکادمی در صفحهٔ اصلی در اولین نمایش آماده‌اند — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/?academy-shortcuts-test=1#/', { waitUntil: 'domcontentloaded' });

    const shortcuts = page.locator('.home-dashboard .quick-section .quick-tile');
    await expect(shortcuts).toHaveCount(17, { timeout: 7000 });
    await expect(page.locator('.home-dashboard .quick-section')).toBeVisible();
    await expect(page.locator('.home-dashboard .quick-section .loading')).toHaveCount(0);
    await expect(page.locator('.home-dashboard .quick-section .lazy-content-placeholder')).toHaveCount(0);
  });
}

test('صفحهٔ مستقل آکادمی بدون انتظار برای اسکرول باز می‌شود', async ({ page }) => {
  await page.goto('/?academy-direct-test=1#/academy', { waitUntil: 'domcontentloaded' });
  const tools = page.locator('.academy-tools .academy-tool');
  await expect(tools).toHaveCount(16, { timeout: 7000 });
  await expect(page.getByRole('heading', { name: 'آکادمی وکالت شهرام مختاری' })).toBeVisible();
});
