-- ۰۰۲۵: اطلاعات پایهٔ هویتی و تماس در فرم ثبت‌نام.
ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female'));
ALTER TABLE users ADD COLUMN phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone <> '';
