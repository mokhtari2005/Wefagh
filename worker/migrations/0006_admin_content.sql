-- مهاجرت ۰۰۰۶: مدیریت محتوای آموزشی توسط مدیران مجاز.
CREATE TABLE IF NOT EXISTS admin_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('course', 'case')),
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 64),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 140),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  payload_json TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_admin_content_public ON admin_content(kind, status, updated_at DESC);
