import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`مطالعات موردی مستند در کارگاه تحلیل پرونده نمایش داده می‌شوند — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/academy/case-studies', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, caseStudies: [
        { id: 'ara-4639', title: 'تفاوت تأیید فسخ با صدور حکم فسخ', documentNumber: '9209970222900384', date: '1392/04/16', court: 'دادگاه تجدیدنظر استان تهران', sourceUrl: 'https://ara.jri.ac.ir/Judge/Text/4639', summary: 'خلاصه آموزشی رأی درباره حدود خواسته و منع صدور رأی خارج از خواسته.', issue: 'آیا تصمیم صادرشده در حدود خواسته بوده است؟', holding: 'دادگاه تجدیدنظر رأی را از جهت خروج از خواسته نقض کرد.', tasks: ['مقایسه خواسته و منطوق'], limits: ['خلاصه جایگزین متن کامل نیست.'] },
        { id: 'ara-39412', title: 'وصف تجریدی چک و دارنده با حسن نیت', documentNumber: '140291920009220359', date: '1403/07/30', court: 'دادگاه تجدیدنظر استان', sourceUrl: 'https://ara.jri.ac.ir/Judge/Text/39412', summary: 'خلاصه آموزشی رأی درباره وضعیت دارنده چک.', issue: 'آیا رأی مربوط به دارنده قبلی قابل تسری است؟', holding: 'اعتراض در همان پرونده رد شد.', tasks: ['تحلیل زنجیره انتقال'], limits: ['رأی قابل تعمیم بی‌قید نیست.'] },
        { id: 'ara-39327', title: 'شرط تنصیف دارایی پس از انتقال مال پیش از دادخواست طلاق', documentNumber: '140250920002237030', date: '1403/10/24', court: 'دادگاه تجدیدنظر استان', sourceUrl: 'https://ara.jri.ac.ir/Judge/Text/39327', summary: 'خلاصه آموزشی رأی درباره شرط تنصیف و فروش مال پیش از دادخواست طلاق.', issue: 'فروش مال پیش از دادخواست طلاق چه اثری در ارزیابی شرط تنصیف داشته است؟', holding: 'رأی با اصلاح تأیید شد و مبلغی بابت تنصیف تعیین شد.', tasks: ['تحلیل خط زمانی و ادله فروش'], limits: ['صفحه منبع امکان فرجام‌خواهی را ذکر می‌کند.'] }
      ] })
    }));
    await page.goto('/?academy-case-study-test=1#/academy/workshops/case-analysis', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'مطالعات موردی مبتنی بر آرای منتشرشده' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.workshop-case-study')).toHaveCount(3, { timeout: 10000 });
    await expect(page.getByText('9209970222900384', { exact: false })).toBeVisible();
    await expect(page.getByText('140291920009220359', { exact: false })).toBeVisible();
    await expect(page.getByText('140250920002237030', { exact: false })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });
}
