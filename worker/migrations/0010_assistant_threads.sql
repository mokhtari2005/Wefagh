-- مهاجرت ۰۰۱۰: تاریخچهٔ گفت‌وگوی دستیار وکیل برای کاربر واردشده.
-- افزایشی است؛ جدول‌های موجود تغییر نمی‌کنند. هر گفت‌وگو و پیام فقط متعلق به کاربر خودش است.

CREATE TABLE IF NOT EXISTS assistant_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL DEFAULT 'گفت‌وگوی تازه' CHECK (length(title) BETWEEN 1 AND 120),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_assistant_threads_user ON assistant_threads (user_id, updated_at);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK (role IN ('user', 'ai')),
  content     TEXT    NOT NULL CHECK (length(content) BETWEEN 1 AND 12000),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread ON assistant_messages (thread_id, id);
