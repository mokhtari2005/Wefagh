import { test, expect } from '@playwright/test';

test('regional calculator loads official Tehran 1405 blocks and applies Tehran building rules', async ({ page }) => {
  await page.goto('/#/calculators/regional');
  await expect(page.locator('#rv-city')).toBeVisible();

  await page.locator('#rv-city').selectOption('tehran');
  await expect(page.locator('#rv-province')).toHaveValue('تهران');
  await expect(page.locator('#rv-zone option')).toHaveCount(22);
  await expect(page.locator('#rv-access option[value="landlocked"]')).toHaveCount(0);
  await page.locator('#rv-city').selectOption('shiraz');
  await expect(page.locator('#rv-access option[value="landlocked"]')).toHaveCount(1);
  await page.locator('#rv-city').selectOption('tehran');
  await expect(page.locator('#rv-access option[value="landlocked"]')).toHaveCount(0);

  await page.locator('#rv-zone').selectOption('22');
  await expect(page.locator('#rv-block option')).toHaveCount(5);
  await page.locator('#rv-block').selectOption('22-05');

  await expect(page.locator('.regional-value-tool')).toContainText('مسکونی: ۱۱۸٬۲۰۰٬۰۰۰ ریال');
  await page.locator('#rv-land-area').fill('100');
  await page.locator('#rv-building').selectOption('yes');
  await page.locator('#rv-building-use').selectOption('residential');
  await page.locator('#rv-building-area').fill('100');
  await page.locator('#rv-stories').fill('6');
  await page.locator('#rv-parking').fill('20');
  await page.locator('.regional-value-form button[type="submit"]').click();

  await expect(page.locator('.regional-result')).toBeVisible();
  await expect(page.locator('.regional-result')).toContainText('ارزش پارکینگ و انباری');
  await expect(page.locator('.regional-result')).toContainText('پارکینگ و انباری واحدهای مسکونی در ارزش اعیانی منظور نمی‌شود');
  await expect(page.locator('.regional-result .amount-value')).toContainText('۱۴٬۸۳۲٬۵۲۰٬۰۰۰ ریال');
  await expect(page.locator('.regional-result')).toContainText('لازم‌الاجرا از ۱۴۰۵/۰۱/۰۱');
});
