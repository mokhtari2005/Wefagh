# ربات تلگرام وفاق

ربات روی همان Worker کار می‌کند (بدون سرور جدا). پیام تلگرام به `POST /api/telegram/webhook` می‌رسد و پاسخ همان‌جا ارسال می‌شود.

## قابلیت‌ها
- **پرسش عمومی** (هر کاربر): پاسخ اولیه با Gemini، همراه هشدار «مشاوره نیست». سقف روزانه برای هر گفتگو (پیش‌فرض ۲۰).
- `/dadresi مبلغ` و `/vakalat مبلغ`: برآورد هزینه دادرسی و حق‌الوکاله با همان قاعده‌های سایت (واحد ریال یا تومان الزامی است). قاعده‌ها «تأیید کاربر (غیررسمی)» هستند و ربات این را در پاسخ می‌نویسد.
- `/link کد`، `/deadlines`، `/unlink`: اتصال حساب سایت، فهرست مواعد ۳۰ روز آینده.
- **یادآوری خودکار** (Cron هر ۳۰ دقیقه): سه روز قبل، یک روز قبل و روز موعد، از ساعت ۸ صبح تهران؛ هر یادآوری فقط یک بار.
- فقط گفتگوی خصوصی؛ گروه‌ها نادیده گرفته می‌شوند. متن پیام‌ها ذخیره نمی‌شود.

## راه‌اندازی (یک‌بار)
1. **توکن:** در BotFather ← `/mybots` ← ربات ← API Token. توکن را فقط در Cloudflare بگذارید، نه در گفتگو یا مخزن.
2. **Secretهای Worker** (Cloudflare ← Workers ← wefagh ← Settings ← Variables and Secrets، نوع Secret):
   - `TELEGRAM_BOT_TOKEN` = توکن BotFather
   - `TELEGRAM_WEBHOOK_SECRET` = یک رشتهٔ تصادفی ۳۲ نویسه‌ای (حروف لاتین، رقم، `_` و `-`)
   - اختیاری (Variable): `TELEGRAM_BOT_USERNAME` = `Vefagh_bot`، `TELEGRAM_AI_DAILY_LIMIT` = `20`
3. **مهاجرت دیتابیس:** محتوای `worker/migrations/0012_telegram.sql` را روی `wefagh-db` اجرا کنید (کنسول D1 یا `npx wrangler d1 migrations apply wefagh-db --remote`).
4. **استقرار Worker** (برای فعال شدن مسیر و Cron).
5. **ثبت webhook:** این آدرس را یک بار در مرورگر باز کنید (مقادیر را جایگزین کنید):

   `https://api.telegram.org/botTOKEN/setWebhook?url=https://mokhtari.ir/api/telegram/webhook&secret_token=SECRET&allowed_updates=["message"]`

   باید `"ok":true` ببینید. بعد از ثبت webhook، دریافت پیام با `getUpdates` (مثلاً از ابزارهای دیگر) خطای ۴۰۹ می‌دهد؛ این طبیعی است.
6. **آزمون:** در تلگرام `/start` بفرستید.

## اتصال حساب (برای یادآوری)
API آماده است: `POST /api/telegram/link-code` (کاربر واردشده) کدی ۸ نویسه‌ای با اعتبار ۱۰ دقیقه می‌دهد؛ کاربر در ربات `/link کد` می‌فرستد. `GET /api/telegram/status` و `POST /api/telegram/unlink` هم موجودند. دکمهٔ مربوطه در صفحهٔ مواعد سایت در مرحلهٔ بعد اضافه می‌شود.

## امنیت
- webhook فقط با هدر `X-Telegram-Bot-Api-Secret-Token` درست پذیرفته می‌شود (مقایسهٔ زمان‌ثابت)، وگرنه ۴۰۳.
- از کاربر اطلاعات هویتی نخواهید؛ متن هر پرسش برای پاسخ به Gemini فرستاده می‌شود. این موضوع در `/privacy` توضیح داده شده است.
- اگر توکن جایی فاش شد، در BotFather با `/revoke` عوضش کنید و Secret را به‌روز کنید.
