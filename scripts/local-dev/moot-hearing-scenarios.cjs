// آزمون مرورگری اتاق دادگاه (Chromium، Gemini شبیه‌سازی‌شده). فقط محلی؛ به هیچ سرویس واقعی وصل نمی‌شود.
// اجرا:
//   MOCK_GEMINI=1 PORT=8092 node scripts/local-dev/devserver.mjs &
//   BASE=http://127.0.0.1:8092 PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/usr/bin/chromium node scripts/local-dev/moot-hearing-scenarios.cjs
// محدودیت: Chromium خودکار پخش را اجازه می‌دهد؛ سیاست پخش و حجم Safari آیفون با این آزمون اثبات نمی‌شود.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const B = process.env.BASE || 'http://127.0.0.1:8092';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const mockState = async (page, patch) => page.evaluate(async (p) => (await fetch('/__mock', { method: 'POST', body: JSON.stringify(p || {}) })).json(), patch);

async function login(page) {
  await page.goto(B + '/#/account');
  await page.fill('input[type=email]', 'tester@example.test');
  await page.fill('input[type=password]', 'رمز-آزمایشی-۱۴۰۵');
  await page.click('form:has(input[type=password]) button[type=submit]');
  await page.waitForTimeout(700);
}

async function nextOrAnswer(page) {
  const next = page.locator('.court-next');
  const answer = page.locator('#court-answer');
  for (let i = 0; i < 80; i++) {
    if (await page.locator('.court-report h3').count()) return;
    if (await page.locator('.court-report .notice').count()) return;
    if (await answer.isVisible().catch(() => false)) {
      await answer.fill('دفاع من بر اساس مستندات پرونده و مواد قانونی مرتبط است و خواسته را قابل پذیرش نمی‌دانم.');
      await page.locator('.court-input .btn').click();
      await page.waitForTimeout(150);
      continue;
    }
    if (await next.isEnabled().catch(() => false)) { await next.click(); await page.waitForTimeout(150); continue; }
    await page.waitForTimeout(150);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const turnStatuses = [];
  page.on('response', (r) => { if (r.url().includes('/api/ai/moot/turn')) turnStatuses.push(r.status()); });
  await login(page);

  const state0 = await mockState(page, { reset: true, longReply: true, failEvalOnce: true });
  check('بانک منتشرشدهٔ محلی حداقل یک پرونده دارد', state0.caseId);

  await page.goto(`${B}/#/moot-court/hearing?case=${state0.caseId}`);
  await page.waitForSelector('.hearing-setup', { timeout: 8000 });
  await page.click('.hearing-setup .btn');
  await page.waitForSelector('.court-log .court-line', { timeout: 8000 });

  // ۱) اولین صدای منشی بدون هیچ لمس دیگری پخش می‌شود و سرعت اعمال می‌شود.
  await page.waitForFunction(() => document.querySelector('.court-audio-status')?.textContent.includes('در حال پخش'), null, { timeout: 8000 }).catch(() => {});
  const first = await page.evaluate(() => ({ status: document.querySelector('.court-audio-status').textContent, plays: document.querySelectorAll('.court-line-play').length }));
  check('صدای منشی تولید و پخش شد', first.status.includes('در حال پخش') || first.plays >= 1, first.status);

  // ۲) تا پایان جلسه پیش می‌رود؛ پاسخ‌های بلند (۱۵۰۰+ نویسه) هم صدا می‌گیرند.
  await nextOrAnswer(page);
  const afterRun = await mockState(page);
  const speech = afterRun.log.filter((l) => l.kind === 'speech');
  const turns = afterRun.log.filter((l) => l.kind === 'turn').length;
  check('نوبت‌های قاضی و طرف مقابل از سرور آمدند', turns >= 6, `${turns} نوبت`);
  check('هیچ تماس TTS از ۹۰۰ نویسه بیشتر نبود (متن بلند تکه‌تکه شد)', speech.length > 0 && speech.every((s) => s.chars <= 900), `بیشترین ${Math.max(...speech.map((s) => s.chars))}`);
  check('پاسخ بلند با چند تماس TTS ساخته شد', speech.length > turns, `${speech.length} تماس برای ${turns} نوبت`);
  const biggest = Math.max(...(afterRun.bodies || [0]));
  check('تاریخچهٔ بیش از ۱۶ کیلوبایت فرستاده شد و همهٔ نوبت‌های هوش مصنوعی ۲۰۰ گرفتند', biggest > 16 * 1024 && turnStatuses.length === 7 && turnStatuses.every((c) => c === 200), `بزرگ‌ترین بدنه ${biggest} بایت؛ وضعیت‌ها ${turnStatuses.join(',')}`);

  // ۳) خطای ارزیابی: پیام + دکمهٔ تلاش دوباره؛ تکمیل ثبت نشده.
  const failedNotice = await page.locator('.court-report .notice').count();
  check('خطای ارزیابی نشان داده شد و دکمهٔ تلاش دوباره دارد', failedNotice === 1 && (await page.locator('.court-report button', { hasText: 'تلاش دوباره' }).count()) === 1);
  check('با ارزیابی ناموفق، تکمیل جلسه ثبت نشد', afterRun.completions === 0, `completions=${afterRun.completions}`);

  // ۴) تلاش دوباره: گزارش ساخته می‌شود و فقط یک‌بار تکمیل ثبت می‌شود.
  await page.locator('.court-report button', { hasText: 'تلاش دوباره' }).click();
  await page.waitForSelector('.court-report h3', { timeout: 8000 });
  await page.waitForTimeout(500);
  const done = await mockState(page);
  check('پس از تلاش دوباره گزارش آمد', (await page.locator('.court-report h3').textContent()).includes('72'));
  check('تکمیل جلسه دقیقاً یک‌بار در D1 ثبت شد', done.completions === 1, `completions=${done.completions}`);

  // ۵) ثبت تکمیل برای گزارش‌های بعدی تکرار نمی‌شود.
  await page.waitForTimeout(400);
  check('تکمیل بعد از گزارش دوباره تکرار نشد', (await mockState(page)).completions === 1);

  check('خطای اجرایی در صفحه نبود', pageErrors.length === 0, pageErrors.join(' | '));
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('اسکرول افقی در ۳۹۰px نبود', !horizontalOverflow);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} موفق`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
