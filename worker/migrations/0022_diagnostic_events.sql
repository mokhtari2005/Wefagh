-- ۰۰۲۲: پایگاه ثبت خطا و بازیابی سامانه؛ بدون ذخیرهٔ اطلاعات هویتی یا متن ورودی کاربران.
CREATE TABLE IF NOT EXISTS diagnostic_events (
  fingerprint TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  component TEXT NOT NULL,
  route TEXT NOT NULL,
  error_code TEXT NOT NULL,
  http_status INTEGER,
  occurrences INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  first_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_status_seen
  ON diagnostic_events(status, last_seen DESC);
