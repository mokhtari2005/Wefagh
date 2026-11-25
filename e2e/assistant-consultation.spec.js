import { test, expect } from '@playwright/test';

async function enableGuestAssistant(page) {
  await page.route('**/api/me', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'UNAUTHENTICATED' }),
  }));
  await page.route('**/api/access-settings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ registrationRequired: false }),
  }));
  await page.route('**/api/ai/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ configured: true, providers: { openai: true, gemini: true, groq: true } }),
  }));
}

test('مشاوره مرحله‌ای پرسش تکمیلی می‌پرسد و سابقه را در نوبت بعد حفظ می‌کند', async ({ page }) => {
  await enableGuestAssistant(page);
  const requests = [];

  await page.route('**/api/ai/assistant', async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);

    if (requests.length === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'need_info',
          text: 'برای انتخاب مسیر حقوقی مناسب، ابتدا باید وضعیت قرارداد روشن شود.',
          questions: [],
          questionOptions: [{
            question: 'آیا توافق یا قرارداد کتبی میان طرفین وجود دارد؟',
            options: ['بله', 'خیر'],
            allowOther: true,
          }],
          notes: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: 'ready',
        text: 'با توجه به وجود قرارداد کتبی و عدم پرداخت شارژ، ابتدا باید سمت متعهد، مفاد قرارداد و صورت‌ریز هزینه‌های مشترک بررسی شود. سپس مدیر ساختمان می‌تواند با رعایت تشریفات مقرر در قانون تملک آپارتمان‌ها، مطالبه رسمی را پیگیری کند. برای تعیین مرجع و اقدام دقیق، مبلغ بدهی، تاریخ مطالبه و مدارک ابلاغ نیز باید بررسی شود.',
        questions: [],
        questionOptions: [],
        notes: [],
        sources: [],
        suggestedDocType: 'letter',
        knownFields: {},
      }),
    });
  });

  await page.goto('/#/assistant/consult', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'مشاوره حقوقی هوشمند' })).toBeVisible();

  const composer = page.locator('textarea.ai-input');
  const initialQuestion = 'مدیر ساختمان می‌خواهد شارژ پرداخت‌نشده یکی از واحدها را مطالبه کند؛ چه اقدامی باید انجام دهد؟';
  await composer.fill(initialQuestion);
  await page.getByRole('button', { name: 'ارسال پیام' }).click();

  await expect(page.getByText('آیا توافق یا قرارداد کتبی میان طرفین وجود دارد؟')).toBeVisible();
  await page.getByRole('button', { name: 'بله', exact: true }).click();
  await page.getByRole('button', { name: 'ارسال پاسخ‌ها و ادامهٔ مشاوره' }).click();

  await expect(page.getByText(/با توجه به وجود قرارداد کتبی/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'تأیید و ادامه' })).toBeVisible();

  expect(requests).toHaveLength(2);
  expect(requests[0].mode).toBe('consult');
  expect(requests[0].message).toContain(initialQuestion);
  expect(requests[1].message).toContain('آیا توافق یا قرارداد کتبی میان طرفین وجود دارد؟');
  expect(requests[1].message).toContain('پاسخ انتخاب‌شده: بله');
  expect(requests[1].history).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'user', text: initialQuestion }),
    expect.objectContaining({ role: 'ai', text: expect.stringContaining('وضعیت قرارداد روشن شود') }),
  ]));
});

test('در صورت خطای سرویس، متن نوشته‌شده کاربر از بین نمی‌رود', async ({ page }) => {
  await enableGuestAssistant(page);
  await page.route('**/api/ai/assistant', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'AI_UNAVAILABLE' }),
  }));

  await page.goto('/#/assistant/consult', { waitUntil: 'domcontentloaded' });
  const composer = page.locator('textarea.ai-input');
  const draft = 'شرح مختصر یک مسئله حقوقی برای آزمون حفظ متن در زمان خطای سرویس.';
  await composer.fill(draft);
  await page.getByRole('button', { name: 'ارسال پیام' }).click();

  await expect(page.getByText(/متن و پیوست‌های شما حفظ شد/)).toBeVisible();
  await expect(composer).toHaveValue(draft);
});

test('آزمون زنده مدل فقط با درخواست دستی اجرا می‌شود', async ({ request }) => {
  test.skip(process.env.RUN_LIVE_AI_E2E !== '1', 'برای جلوگیری از مصرف ناخواسته اعتبار مدل، آزمون زنده به‌صورت پیش‌فرض خاموش است.');

  const [settingsResponse, statusResponse] = await Promise.all([
    request.get('/api/access-settings'),
    request.get('/api/ai/status'),
  ]);
  expect(settingsResponse.ok()).toBeTruthy();
  expect(statusResponse.ok()).toBeTruthy();

  const settings = await settingsResponse.json();
  const status = await statusResponse.json();
  test.skip(settings.registrationRequired !== false, 'آزمون زنده بدون نشست کاربری فقط در حالت مجاز بودن مهمان اجرا می‌شود.');
  test.skip(status.configured !== true, 'سرویس هوش مصنوعی روی سرور پیکربندی نشده است.');

  const response = await request.post('/api/ai/assistant', {
    data: {
      mode: 'consult',
      docType: 'petition',
      message: 'برای پاسخ حقوقی دقیق درباره مطالبه شارژ ساختمان، سه واقعیت مهمی را که ابتدا باید روشن شوند نام ببر. از نقل ماده قانونی خودداری کن.',
      history: [],
    },
    timeout: 120_000,
  });
  expect(response.status(), 'درخواست زنده دستیار باید با موفقیت پاسخ بگیرد').toBe(200);
  const result = await response.json();
  expect(result.ok).toBe(true);
  expect(['need_info', 'ready']).toContain(result.status);
  expect(typeof result.text).toBe('string');
  expect(result.text.trim().length).toBeGreaterThan(30);
});
