-- مهاجرت ۰۰۱۸: تنظیمات دسترسی عمومی سامانه.
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('registration_required', 'false');
