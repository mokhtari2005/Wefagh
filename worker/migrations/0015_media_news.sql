-- خبرهای مرتبط با حقوق و وکالت که از منابع داخلیِ مجاز گردآوری و خودکار منتشر می‌شوند.
CREATE TABLE IF NOT EXISTS media_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 300),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 480),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 2 AND 100),
  source_url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (length(category) BETWEEN 2 AND 80),
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_media_news_published ON media_news(published_at DESC);
