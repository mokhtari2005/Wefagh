-- مهاجرت ۰۰۰۹: بانک پرونده‌های موت‌کورت و سوابق مشاهده/تمرین هر کاربر.
-- فقط جدول‌های جدید؛ جدول‌های موجود تغییری نمی‌کنند.

CREATE TABLE IF NOT EXISTS moot_cases (
  id          TEXT PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 64),
  area        TEXT NOT NULL CHECK (length(area) BETWEEN 2 AND 64),
  difficulty  TEXT NOT NULL CHECK (difficulty IN ('basic', 'medium', 'advanced')),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'retired')),
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  data_json   TEXT NOT NULL CHECK (json_valid(data_json)),
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  origin      TEXT NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed', 'ai', 'admin')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_moot_cases_published ON moot_cases(status, area, difficulty);

CREATE TABLE IF NOT EXISTS moot_case_history (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id     TEXT NOT NULL REFERENCES moot_cases(id) ON DELETE CASCADE,
  views       INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  completions INTEGER NOT NULL DEFAULT 0 CHECK (completions >= 0),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, case_id)
);
CREATE INDEX IF NOT EXISTS idx_moot_case_history_user ON moot_case_history(user_id, last_seen_at DESC);
