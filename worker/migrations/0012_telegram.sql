-- مهاجرت ۰۰۱۲: ربات تلگرام (اتصال حساب، یادآوری مواعد، سقف روزانهٔ هوش مصنوعی).
-- متن پیام‌های کاربران ذخیره نمی‌شود؛ فقط شناسهٔ گفت‌وگو و شمارنده‌ها.

-- اتصال یک حساب وفاق به یک گفت‌وگوی خصوصی تلگرام (هر حساب یک گفت‌وگو، هر گفت‌وگو یک حساب).
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id   INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id   INTEGER NOT NULL UNIQUE,
  linked_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- کد یک‌بارمصرف اتصال؛ فقط هش کد ذخیره می‌شود.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code_hash  TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_codes_user ON telegram_link_codes (user_id);

-- یادآوری‌های ارسال‌شده؛ کلید ترکیبی از ارسال دوباره جلوگیری می‌کند. kind: d3، d1 یا d0 (روز مانده).
CREATE TABLE IF NOT EXISTS telegram_reminders_sent (
  deadline_id INTEGER NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('d3', 'd1', 'd0')),
  sent_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (deadline_id, kind)
);

-- شمارندهٔ روزانهٔ پرسش‌های هوش مصنوعی هر گفت‌وگو (کنترل هزینه و سوءاستفاده).
CREATE TABLE IF NOT EXISTS telegram_usage (
  chat_id INTEGER NOT NULL,
  day     TEXT    NOT NULL CHECK (length(day) = 10),
  ai_count INTEGER NOT NULL DEFAULT 0 CHECK (ai_count >= 0),
  PRIMARY KEY (chat_id, day)
);
