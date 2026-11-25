import { test, expect } from '@playwright/test';

test('regional calculator loads official Tehran 1405 blocks and applies Tehran building rules', async ({ page }) => {
  await page.goto('/#/calculators/regional');
  await expect(page.locator('#rv-city')).toBeVisible();
  await expect(page.locator('.calculator-guidance')).toHaveCSS('direction', 'rtl');
  await expect(page.locator('.calculator-guidance')).toHaveCSS('text-align', 'right');

  await expect(page.locator('#rv-province')).toHaveValue('fars');
  await expect(page.locator('#rv-city')).toHaveValue('shiraz');
  await page.locator('#rv-province').selectOption('tehran');
  await expect(page.locator('#rv-city')).toHaveValue('tehran');
  await expect(page.locator('#rv-city option')).toHaveText(['تهران']);
  await expect(page.locator('#rv-zone option')).toHaveCount(22);
  await expect(page.locator('#rv-access option[value="landlocked"]')).toHaveCount(0);
  await page.locator('#rv-province').selectOption('fars');
  await expect(page.locator('#rv-city')).toHaveValue('shiraz');
  await expect(page.locator('#rv-access option[value="landlocked"]')).toHaveCount(1);
  await page.locator('#rv-province').selectOption('tehran');
  await expect(page.locator('#rv-city')).toHaveValue('tehran');
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
  await expect(page.locator('.regional-result .notice')).toHaveCSS('direction', 'rtl');
  await expect(page.locator('.regional-result .notice')).toHaveCSS('text-align', 'right');
});

test('legal guidance is right-aligned across all calculator pages', async ({ page }) => {
  for (const tool of ['regional', 'court', 'attorney', 'delay']) {
    await page.goto(`/#/calculators/${tool}`);
    const guidance = page.locator('.calculator-guidance');
    await expect(guidance).toBeVisible();
    await expect(guidance).toHaveCSS('direction', 'rtl');
    await expect(guidance).toHaveCSS('text-align', 'right');
    const iconOnRight = await guidance.evaluate((node) => {
      const icon = node.firstElementChild.getBoundingClientRect();
      const text = node.lastElementChild.getBoundingClientRect();
      return icon.right >= text.right;
    });
    expect(iconOnRight, `guidance icon should be at the right for ${tool}`).toBeTruthy();
  }
});
