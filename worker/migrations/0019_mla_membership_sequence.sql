-- مهاجرت ۰۰۱۹: تغییر شناسهٔ عضویت به MLA و آغاز شماره‌گذاری از ۲۰۰۰.
-- اعضای فعلی بر اساس ترتیب شناسهٔ پایدار داخلی، شماره‌های متوالی و بدون صفر ابتدایی می‌گیرند.
UPDATE users
SET membership_no = 'MLA-' || CAST(
  1999 + (SELECT COUNT(*) FROM users AS earlier WHERE earlier.id <= users.id)
  AS TEXT
);

-- شمارندهٔ مستقل، تخصیص اتمیک شمارهٔ بعدی را برای ثبت‌نام‌های هم‌زمان تضمین می‌کند.
CREATE TABLE IF NOT EXISTS membership_sequence (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL CHECK (next_value >= 2000)
);

INSERT INTO membership_sequence (id, next_value)
VALUES (1, 2000 + (SELECT COUNT(*) FROM users))
ON CONFLICT(id) DO UPDATE SET next_value = excluded.next_value;
