-- Avatar riêng از پروفایل آموزشی؛ تصویر فقط از طریق نشست صاحب حساب قابل مدیریت است.
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_url TEXT NOT NULL CHECK (length(data_url) <= 500000),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
