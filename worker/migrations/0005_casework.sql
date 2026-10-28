-- مهاجرت ۰۰۰۵: نشست‌های ذخیره‌شدهٔ موت‌کورت و تاریخچهٔ تمرین هر کاربر.
CREATE TABLE IF NOT EXISTS moot_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id     TEXT NOT NULL CHECK (length(case_id) BETWEEN 1 AND 64),
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  answers_json TEXT NOT NULL DEFAULT '{}',
  rubric_json  TEXT NOT NULL DEFAULT '[]',
  stage       TEXT NOT NULL DEFAULT 'facts' CHECK (stage IN ('facts', 'answers', 'check', 'result')),
  score       INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_moot_sessions_user_updated ON moot_sessions(user_id, updated_at DESC);
