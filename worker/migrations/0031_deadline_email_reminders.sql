-- ارسال ایمیل یادآوری برای موعدهایی که اعلان اختصاصی آن‌ها فعال شده است.
CREATE TABLE IF NOT EXISTS deadline_email_reminders_sent (
  deadline_id INTEGER PRIMARY KEY REFERENCES deadlines(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL
);
