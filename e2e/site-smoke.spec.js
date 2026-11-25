import { test, expect } from '@playwright/test';

test('صفحه اصلی آکادمی وکالت بارگذاری می‌شود', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response, 'درخواست صفحه اصلی باید پاسخ HTTP داشته باشد').not.toBeNull();
  expect(response.status()).toBeLessThan(400);

  await expect(page).toHaveTitle(/آکادمی وکالت شهرام مختاری/);
  await expect(page.locator('.brand strong')).toContainText('آکادمی وکالت شهرام مختاری');
  await expect(page.locator('#main')).toBeVisible();

  expect(pageErrors, 'خطای اجرایی جاوااسکریپت در صفحه اصلی').toEqual([]);
});

test('وضعیت عمومی سرویس هوش مصنوعی بدون افشای کلید قابل دریافت است', async ({ request }) => {
  const response = await request.get('/api/ai/status');
  expect(response.status()).toBe(200);

  const status = await response.json();
  expect(typeof status.configured).toBe('boolean');
  expect(status.providers).toBeTruthy();
  for (const provider of ['openai', 'gemini', 'groq']) {
    expect(typeof status.providers[provider]).toBe('boolean');
  }

  // Endpoint عمومی فقط وضعیت پیکربندی را گزارش می‌کند و نباید هیچ مقدار محرمانه‌ای برگرداند.
  const serialized = JSON.stringify(status);
  expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{12,}/);
  expect(serialized).not.toMatch(/AIza[A-Za-z0-9_-]{20,}/);
});
