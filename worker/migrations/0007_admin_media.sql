-- مدیریت مستقل مقاله‌ها و قسمت‌های پادکست؛ رسانه‌های موجود در کد به‌عنوان محتوای پایه حفظ می‌شوند.
CREATE TABLE IF NOT EXISTS admin_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('article', 'episode')),
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 100),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 10 AND 600),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  payload_json TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_admin_media_public ON admin_media(kind, status, updated_at DESC);
