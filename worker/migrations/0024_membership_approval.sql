-- ۰۰۲۴: وضعیت مستقل بررسی و تصویب عضویت.
ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (membership_status IN ('pending', 'approved', 'rejected'));
-- کاربران موجود عضو تأییدشده تلقی می‌شوند؛ ثبت‌نام‌های جدید در کد برنامه pending می‌مانند.
CREATE INDEX IF NOT EXISTS idx_users_membership_status ON users(membership_status, created_at);
