-- مهاجرت ۰۰۰۹: سوابق کاربران و گردش بررسی پرونده‌های موت‌کورت.
-- پرونده‌ها در جدول موجود admin_content (kind = 'case') نگهداری می‌شوند؛ این مهاجرت هیچ جدول موجودی را تغییر نمی‌دهد.

CREATE TABLE IF NOT EXISTS moot_case_history (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_slug    TEXT NOT NULL CHECK (length(case_slug) BETWEEN 2 AND 64),
  views        INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  selections   INTEGER NOT NULL DEFAULT 0 CHECK (selections >= 0),
  completions  INTEGER NOT NULL DEFAULT 0 CHECK (completions >= 0),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, case_slug)
);
CREATE INDEX IF NOT EXISTS idx_moot_case_history_user ON moot_case_history(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS moot_case_reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_slug    TEXT NOT NULL CHECK (length(case_slug) BETWEEN 2 AND 64),
  action       TEXT NOT NULL CHECK (action IN ('create', 'edit', 'submit', 'approve', 'return', 'retire')),
  from_state   TEXT,
  to_state     TEXT,
  actor_id     INTEGER NOT NULL REFERENCES users(id),
  note         TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_moot_case_reviews_slug ON moot_case_reviews(case_slug, created_at DESC);
