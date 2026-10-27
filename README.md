# وِفاق (Wefagh)

اپلیکیشن رسمی گروه وکلای مدافع فرهنگ، اندیشه و قانون وِفاق — [wefagh.ir](https://wefagh.ir)

> **وضعیت:** فاز ۱ (پایه و معماری) — بخش‌های آزموده‌شده و باقی‌مانده در [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#۷-وضعیت-پیاده‌سازی) ثبت شده است.

## شروع سریع
راهنمای کامل فارسی (دانلود، GitHub، Cloudflare، اتصال دامنه): [راهنمای-شروع.md](راهنمای-شروع.md)

## اجرای محلی

نیازمند Node.js ۲۲ یا بالاتر (بدون نصب وابستگی خارجی).

```bash
npm test          # ۲۶ تست: اعتبارسنجی، API، تاریخ شمسی، مهاجرت SQLite
npm run check     # بررسی نحوی تمام فایل‌های JS
npm run dev:site  # سرور محلی روی http://localhost:8080
```

## ساختار
- `site/` — رابط کاربری استاتیک (Cloudflare Pages)
- `worker/` — API (Cloudflare Worker + D1)
- `tests/` — تست‌ها با `node:test`
- `docs/` — معماری و راهنمای استقرار

## استقرار
مراحل کامل روی Cloudflare در [docs/DEPLOYMENT-CLOUDFLARE.md](docs/DEPLOYMENT-CLOUDFLARE.md) آمده است.

## یادداشت
- محتوای صفحهٔ «درباره وِفاق» نمونه است و پیش از انتشار باید توسط گروه تأیید شود.
- ایمیل رسمی: Vefagh.lawyers@gmail.com
