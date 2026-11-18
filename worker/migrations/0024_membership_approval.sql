-- ۰۰۲۴: وضعیت مستقل بررسی و تصویب عضویت.
-- کاربران فعلی عضو تأییدشده باقی می‌مانند؛ ثبت‌نام‌های جدید در انتظار تصمیم مدیر هستند.
ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (membership_status IN ('pending', 'approved', 'rejected'));
UPDATE users SET membership_status='approved';
CREATE INDEX IF NOT EXISTS idx_users_membership_status ON users(membership_status, created_at);
