CREATE TABLE IF NOT EXISTS site_visitors (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  display_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  current_path TEXT NOT NULL DEFAULT '/',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_site_visitors_last_seen ON site_visitors(last_seen);
CREATE INDEX IF NOT EXISTS idx_site_visitors_first_seen ON site_visitors(first_seen);
