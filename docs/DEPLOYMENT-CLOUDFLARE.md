# استقرار وِفاق روی Cloudflare (mokhtari.ir با HTTPS)

> این سند مرحله‌به‌مرحله است. بخش‌هایی که در محیط توسعه آزموده شده‌اند با ✅ مشخص شده‌اند؛ بقیه باید روی حساب Cloudflare شما اجرا و بررسی شوند.

## پیش‌نیازها
1. حساب Cloudflare و دسترسی به مدیریت DNS دامنه `mokhtari.ir`.
2. Node.js نسخهٔ ۲۰ یا بالاتر و Wrangler (`npm i -D wrangler`) — پس از دسترسی به npm.
3. ایمیل رسمی `Vefagh.lawyers@gmail.com` برای حساب‌ها و اعلان‌ها (پیشنهاد: بعداً به ایمیل دامنهٔ سازمانی مثل `info@mokhtari.ir` تغییر دهید).

## مرحله ۱: انتقال DNS به Cloudflare
1. در داشبورد Cloudflare یک سایت (Zone) با نام `mokhtari.ir` بسازید.
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
✅ فایل مهاجرت‌های `0001` تا `0007` روی SQLite داخلی Node آزموده شده‌اند؛ اجرای روی D1 واقعی هنوز انجام نشده است. هر مهاجرت جدید را پیش از استقرار Worker روی D1 اجرا کنید. مهاجرت `0007_admin_media.sql` جدول مستقل مدیریت مقاله‌ها و پادکست‌ها را می‌سازد.

## مرحله ۳: استقرار Worker (API)
```bash
cd worker
npx wrangler deploy
```
در `wrangler.toml` مسیر `mokhtari.ir/api/*` تعریف شده است. پس از دیپلوی، بررسی کنید:
```bash
curl -sS https://mokhtari.ir/api/health
# انتظار: {"ok":true,"service":"wefagh-api"}
```

### استقرار خودکار با Workers Builds (مهاجرت پیش از Deploy)
در Cloudflare: Workers & Pages ← wefagh ← Settings ← Builds ← **Deploy command** را برابر مقدار زیر بگذارید:
```bash
npm run deploy:worker
```
این دستور ابتدا `wrangler d1 migrations apply wefagh-db --remote` را اجرا می‌کند و فقط اگر موفق بود Worker را deploy می‌کند؛ پس کد جدید هرگز با ساختار قدیمی دیتابیس اجرا نمی‌شود. اگر مهاجرتی خطا بدهد، build شکست می‌خورد و نسخهٔ قبلی Worker فعال می‌ماند. مهاجرت‌ها باید قابل‌تکرار و سازگار با نسخهٔ قبلی کد باشند. `npm run check:migrations` شماره‌گذاری فایل‌ها را در CI بررسی می‌کند. مهاجرت‌های اجراشده در جدول `d1_migrations` ثبت می‌شوند.

## مرحله ۴: استقرار رابط کاربری (Pages)
راه ساده (بدون Git):
```bash
npx wrangler pages project create wefagh-site --production-branch main
npx wrangler pages deploy site --project-name wefagh-site
```
راه پیشنهادی (Git): مخزن را به Cloudflare Pages متصل کنید؛ خروجی بیلد: پوشه `site`، دستور بیلد: خالی.

سپس در پروژهٔ Pages → Custom domains، دامنه‌های `mokhtari.ir` و `www.mokhtari.ir` را اضافه کنید. `www` را با ریدایرکت ۳۰۱ به `mokhtari.ir` هدایت کنید.

## مرحله ۵: مسیریابی یکپارچه (`/` و `/api`)
در زون `mokhtari.ir` → Workers Routes، قانون `mokhtari.ir/api/*` به Worker `wefagh` وصل شود (این کار در `wrangler.toml` هم انجام می‌شود). بقیهٔ مسیرها به Pages می‌روند.

## مرحله ۶: HTTPS و امنیت
- SSL/TLS → حالت **Full (strict)**.
- Always Use HTTPS = روشن؛ Automatic HTTPS Rewrites = روشن.
- HSTS را پس از اطمینان از HTTPS کامل فعال کنید (max-age ≥ ۶ ماه).
- هدرهای امنیتی در فایل `site/_headers` تعریف شده‌اند؛ پس از دیپلوی با `curl -I https://mokhtari.ir` بررسی کنید.

## مرحله ۷: Turnstile (ضد اسپم)
1. Turnstile → Add site → دامنه `mokhtari.ir`.
2. کلید سایت (Site key) را در `site/js/contact.js` و کلید مخفی (Secret) را به‌عنوان Secret در Worker ثبت کنید:
```bash
npx wrangler secret put TURNSTILE_SECRET
```
> در فاز ۱ هنوز Turnstile در کد فعال نشده است؛ این مرحله هنگام افزودن فرم‌ها اجرا می‌شود.

## مرحله ۸: بررسی نهایی (چک‌لیست)
- [ ] `https://mokhtari.ir` با قفل HTTPS باز می‌شود و ریدایرکت HTTP انجام می‌شود.
- [ ] `https://mokhtari.ir/api/health` پاسخ JSON می‌دهد.
- [ ] فرم تماس یک رکورد در جدول `contact_messages` می‌سازد (`wrangler d1 execute wefagh-db --remote --command "SELECT COUNT(*) FROM contact_messages"`).
- [ ] تاریخ‌ها در صفحه به‌صورت شمسی نمایش داده می‌شوند.
- [ ] صفحه روی موبایل بدون اسکرول افقی است.

## عیب‌یابی سریع
| مشکل | راه‌حل |
|---|---|
| `/api` با ۴۰۴ پاسخ می‌دهد | Route در زون تنظیم نشده یا Worker دیپلوی نشده است |
| خطای TLS | حالت SSL را روی Full (strict) بگذارید و مطمئن شوید گواهی صادر شده است |
| کوکی‌ها ست نمی‌شوند | سایت باید روی HTTPS باشد؛ `Secure` بدون HTTPS کار نمی‌کند |

## ارسال ایمیل تأیید (Gmail API)
Worker برای ارسال ایمیل چهار Secret لازم دارد: `GMAIL_CLIENT_ID`، `GMAIL_CLIENT_SECRET`، `GMAIL_REFRESH_TOKEN` و `GMAIL_FROM`. اگر ارسال شکست بخورد، کاربر خطایی نمی‌بیند و فقط در لاگ Worker (`auth.send_verification`) ثبت می‌شود.

تشخیص: با حساب مدیر وارد پنل مدیریت شوید و در بخش «تشخیص ارسال ایمیل» دکمهٔ «بررسی تنظیمات ایمیل» و سپس «ارسال ایمیل آزمایشی به خودم» را بزنید. (مسیرهای معادل: `GET /api/admin/mail/status?probe=1` و `POST /api/admin/mail/test`.)

علت‌های رایج:
- `invalid_grant`: Refresh token باطل شده است. اگر برنامهٔ OAuth در Google Cloud روی حالت Testing باشد، توکن بعد از ۷ روز منقضی می‌شود. برنامه را به Production ببرید و توکن تازه بسازید.
- `invalid_client`: شناسه یا رمز کلاینت درست نیست.
- خطای 403 هنگام ارسال: Gmail API فعال نیست یا scope مربوط به `gmail.send` داده نشده است.
- پس از تغییر Secretها، Worker را دوباره deploy کنید.
