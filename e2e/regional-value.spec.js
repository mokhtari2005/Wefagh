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

    // Verify the browser actually requested the refreshed calculator module
    // and attached the cache-busted stylesheet, not a previously cached module.
    await expect.poll(async () => page.locator('link[data-calculator-styles]').getAttribute('href')).toContain('20261125-rtl-legal-notes-1');

    // Exercise the shared list, notice and muted-text rules in the actual
    // calculator workspace on every calculator route.
    const rtlRules = await page.locator('.calculator-workspace').evaluate((workspace) => {
      const sample = document.createElement('div');
      sample.innerHTML = '<div class="tool-out"><ul><li>آزمون راست‌چین فهرست</li></ul></div><div class="notice">هشدار آزمون</div><p class="muted">متن راهنمای آزمون</p>';
      workspace.append(sample);
      const list = sample.querySelector('ul');
      const item = sample.querySelector('li');
      const notice = sample.querySelector('.notice');
      const muted = sample.querySelector('.muted');
      const listStyle = getComputedStyle(list);
      const markerStyle = getComputedStyle(item, '::marker');
      const values = {
        listDirection: listStyle.direction,
        listTextAlign: listStyle.textAlign,
        listPaddingRight: parseFloat(listStyle.paddingRight),
        listStylePosition: listStyle.listStylePosition,
        markerDirection: markerStyle.direction,
        noticeDirection: getComputedStyle(notice).direction,
        noticeTextAlign: getComputedStyle(notice).textAlign,
        mutedDirection: getComputedStyle(muted).direction,
        mutedTextAlign: getComputedStyle(muted).textAlign,
      };
      sample.remove();
      return values;
    });
    expect(rtlRules.listDirection, `list direction for ${tool}`).toBe('rtl');
    expect(rtlRules.listTextAlign, `list alignment for ${tool}`).toBe('right');
    expect(rtlRules.listPaddingRight, `list marker space for ${tool}`).toBeGreaterThan(0);
    expect(rtlRules.listStylePosition, `list marker position for ${tool}`).toBe('outside');
    expect(rtlRules.markerDirection, `list marker direction for ${tool}`).toBe('rtl');
    expect(rtlRules.noticeDirection, `notice direction for ${tool}`).toBe('rtl');
    expect(rtlRules.noticeTextAlign, `notice alignment for ${tool}`).toBe('right');
    expect(rtlRules.mutedDirection, `muted text direction for ${tool}`).toBe('rtl');
    expect(rtlRules.mutedTextAlign, `muted text alignment for ${tool}`).toBe('right');

    const iconOnRight = await guidance.evaluate((node) => {
      const icon = node.firstElementChild.getBoundingClientRect();
      const text = node.lastElementChild.getBoundingClientRect();
      return icon.right >= text.right;
    });
    expect(iconOnRight, `guidance icon should be at the right for ${tool}`).toBeTruthy();
  }
});
