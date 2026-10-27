-- مهاجرت اولیه: پیام‌های فرم تماس.
-- سایر جداول (کاربران، آکادمی، قوانین و …) در فازهای بعد با شمارهٔ جدید افزوده می‌شوند.

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  email      TEXT    NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  topic      TEXT    NOT NULL DEFAULT 'general',
  message    TEXT    NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
  status     TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'answered', 'archived')),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created
  ON contact_messages (status, created_at);
