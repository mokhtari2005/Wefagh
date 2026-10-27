# استقرار وِفاق روی Cloudflare (wefagh.ir با HTTPS)

> این سند مرحله‌به‌مرحله است. بخش‌هایی که در محیط توسعه آزموده شده‌اند با ✅ مشخص شده‌اند؛ بقیه باید روی حساب Cloudflare شما اجرا و بررسی شوند.

## پیش‌نیازها
1. حساب Cloudflare و دسترسی به مدیریت DNS دامنه `wefagh.ir`.
2. Node.js نسخهٔ ۲۰ یا بالاتر و Wrangler (`npm i -D wrangler`) — پس از دسترسی به npm.
3. ایمیل رسمی `Vefagh.lawyers@gmail.com` برای حساب‌ها و اعلان‌ها (پیشنهاد: بعداً به ایمیل دامنهٔ سازمانی مثل `info@wefagh.ir` تغییر دهید).

## مرحله ۱: انتقال DNS به Cloudflare
1. در داشبورد Cloudflare یک سایت (Zone) با نام `wefagh.ir` بسازید.
2. Cloudflare رکوردهای DNS فعلی را اسکن می‌کند؛ رکوردهای ایمیل (MX، SPF، DKIM) را حفظ کنید.
3. Nameserverهای داده‌شده را در پنل ثبت‌کنندهٔ دامنه جایگزین کنید. تا ۲۴ ساعت طول می‌کشد.
4. وضعیت «Active» را در داشبورد بررسی کنید.

## مرحله ۲: ساخت پایگاه داده D1
```bash
cd worker
npx wrangler d1 create wefagh-db
```
خروجی شامل `database_id` است. آن را در `worker/wrangler.toml` در بخش `database_id` قرار دهید.
```bash
npx wrangler d1 migrations apply wefagh-db --remote
```
✅ فایل `migrations/0001_init.sql` روی SQLite واقعی (`node:sqlite` در Node 22) اجرا و آزموده شد؛ اجرای روی D1 واقعی هنوز انجام نشده است.

## مرحله ۳: استقرار Worker (API)
```bash
cd worker
npx wrangler deploy
```
در `wrangler.toml` مسیر `wefagh.ir/api/*` تعریف شده است. پس از دیپلوی، بررسی کنید:
```bash
curl -sS https://wefagh.ir/api/health
# انتظار: {"ok":true,"service":"wefagh-api"}
```

## مرحله ۴: استقرار رابط کاربری (Pages)
راه ساده (بدون Git):
```bash
npx wrangler pages project create wefagh-site --production-branch main
npx wrangler pages deploy site --project-name wefagh-site
```
راه پیشنهادی (Git): مخزن را به Cloudflare Pages متصل کنید؛ خروجی بیلد: پوشه `site`، دستور بیلد: خالی.

سپس در پروژهٔ Pages → Custom domains، دامنه‌های `wefagh.ir` و `www.wefagh.ir` را اضافه کنید. `www` را با ریدایرکت ۳۰۱ به `wefagh.ir` هدایت کنید.

## مرحله ۵: مسیریابی یکپارچه (`/` و `/api`)
در زون `wefagh.ir` → Workers Routes، قانون `wefagh.ir/api/*` به Worker `wefagh-api` وصل شود (این کار در `wrangler.toml` هم انجام می‌شود). بقیهٔ مسیرها به Pages می‌روند.

## مرحله ۶: HTTPS و امنیت
- SSL/TLS → حالت **Full (strict)**.
- Always Use HTTPS = روشن؛ Automatic HTTPS Rewrites = روشن.
- HSTS را پس از اطمینان از HTTPS کامل فعال کنید (max-age ≥ ۶ ماه).
- هدرهای امنیتی در فایل `site/_headers` تعریف شده‌اند؛ پس از دیپلوی با `curl -I https://wefagh.ir` بررسی کنید.

## مرحله ۷: Turnstile (ضد اسپم)
1. Turnstile → Add site → دامنه `wefagh.ir`.
2. کلید سایت (Site key) را در `site/js/contact.js` و کلید مخفی (Secret) را به‌عنوان Secret در Worker ثبت کنید:
```bash
npx wrangler secret put TURNSTILE_SECRET
```
> در فاز ۱ هنوز Turnstile در کد فعال نشده است؛ این مرحله هنگام افزودن فرم‌ها اجرا می‌شود.

## مرحله ۸: بررسی نهایی (چک‌لیست)
- [ ] `https://wefagh.ir` با قفل HTTPS باز می‌شود و ریدایرکت HTTP انجام می‌شود.
- [ ] `https://wefagh.ir/api/health` پاسخ JSON می‌دهد.
- [ ] فرم تماس یک رکورد در جدول `contact_messages` می‌سازد (`wrangler d1 execute wefagh-db --remote --command "SELECT COUNT(*) FROM contact_messages"`).
- [ ] تاریخ‌ها در صفحه به‌صورت شمسی نمایش داده می‌شوند.
- [ ] صفحه روی موبایل بدون اسکرول افقی است.

## عیب‌یابی سریع
| مشکل | راه‌حل |
|---|---|
| `/api` با ۴۰۴ پاسخ می‌دهد | Route در زون تنظیم نشده یا Worker دیپلوی نشده است |
| خطای TLS | حالت SSL را روی Full (strict) بگذارید و مطمئن شوید گواهی صادر شده است |
| کوکی‌ها ست نمی‌شوند | سایت باید روی HTTPS باشد؛ `Secure` بدون HTTPS کار نمی‌کند |
