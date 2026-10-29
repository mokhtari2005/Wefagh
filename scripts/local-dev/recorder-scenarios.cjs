// آزمون مرورگری ضبط صدا (Chromium): پخش، دریافت فایل و خطای پخش. اجرا: BASE=http://127.0.0.1:PORT NODE_PATH=$(npm root -g) node scripts/local-dev/recorder-scenarios.cjs
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8092';
const SCEN = {
  'A-chromium-webm': { init: '' },
  'B-forced-mp4': { init: `const o=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=t=>t.includes('mp4')?o('audio/mp4'):false;` },
  'C-safari-like-empty-mimeType': { init: `const o=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=t=>t.includes('mp4')?o('audio/mp4'):false;Object.defineProperty(MediaRecorder.prototype,'mimeType',{get(){return ''}});` },
  'D-broken-audio-source': { init: `const oc=URL.createObjectURL.bind(URL);URL.createObjectURL=(b)=>{oc(b);return 'blob:http://127.0.0.1:8099/does-not-exist';};` },
};
async function run(name, { init }) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(B + '/#/account');
  await page.fill('input[type=email]', 'tester@example.test');
  await page.fill('input[type=password]', 'رمز-آزمایشی-۱۴۰۵');
  await page.click('form:has(input[type=password]) button[type=submit]');
  await page.waitForTimeout(600);
  await page.goto(B + '/#/moot-court');
  await page.waitForTimeout(600);
  const rec = page.locator('.rec-button');
  for (let i = 0; i < 4 && !(await rec.isVisible().catch(() => false)); i++) {
    await page.locator('button', { hasText: 'مرحلهٔ بعد' }).first().click().catch(() => {});
    await page.waitForTimeout(250);
  }
  await rec.click(); await page.waitForTimeout(1800); await rec.click();
  await page.waitForTimeout(6500);
  const status = await page.locator('.rec-status').textContent();
  const cls = await page.locator('.rec-status').getAttribute('class');
  const hint = await page.locator('.rec-hint').textContent();
  const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await page.locator('button', { hasText: 'دریافت فایل' }).first().click().catch(() => {});
  const d = await dl;
  let dlInfo = null;
  if (d) { try { const fs = require('fs'); const p = await d.path(); dlInfo = { name: d.suggestedFilename(), size: fs.statSync(p).size, head: fs.readFileSync(p).subarray(0, 8).toString('hex') }; } catch (e) { dlInfo = { failed: d.failure() ? d.failure().errorText : 'download-error' }; } } else dlInfo = { none: true };
  await page.locator('button', { hasText: 'پخش' }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const play = await page.evaluate(() => { const a = document.querySelector('.oral-player'); return { paused: a.paused, t: +a.currentTime.toFixed(2), err: a.error ? a.error.code : null }; });
  await browser.close();
  return { name, status, statusClass: cls, hint, download: dlInfo, play, pageErrors };
}
(async () => {
  const only = process.argv[2];
  for (const [n, cfg] of Object.entries(SCEN)) {
    if (only && !n.startsWith(only)) continue;
    console.log(JSON.stringify(await run(n, cfg), null, 2));
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
