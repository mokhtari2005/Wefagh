-- مهاجرت ۰۰۱۴: شماره عضویت یکتای ثبت‌نام‌کنندگان و اطلاعات عنوان/سمت.
ALTER TABLE users ADD COLUMN membership_no TEXT;
ALTER TABLE users ADD COLUMN professional_title TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN position TEXT NOT NULL DEFAULT '';

-- برای کاربران موجود نیز شماره یکتا بر پایه شناسه پایدار داخلی ایجاد می‌شود.
UPDATE users
SET membership_no = 'WFA-' || printf('%08d', id)
WHERE membership_no IS NULL OR membership_no = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_membership_no
ON users(membership_no);
