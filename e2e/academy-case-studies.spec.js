import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`مطالعات موردی مستند در کارگاه تحلیل پرونده نمایش داده می‌شوند — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/?academy-case-study-test=1#/academy/workshops/case-analysis', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'مطالعات موردی مبتنی بر آرای منتشرشده' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.workshop-case-study')).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByText('9209970222900384', { exact: false })).toBeVisible();
    await expect(page.getByText('140291920009220359', { exact: false })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });
}
