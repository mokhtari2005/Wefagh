-- ۰۰۲۱: یادآوری اختصاصی هر موعد و اشتراک اعلان Push
ALTER TABLE deadlines ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reminder_enabled IN (0,1));
ALTER TABLE deadlines ADD COLUMN reminder_days INTEGER NOT NULL DEFAULT 1 CHECK(reminder_days IN (1,3,7));
ALTER TABLE deadlines ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '08:00';
CREATE TABLE IF NOT EXISTS push_subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_reminders_sent(deadline_id INTEGER PRIMARY KEY REFERENCES deadlines(id) ON DELETE CASCADE,sent_at TEXT NOT NULL);