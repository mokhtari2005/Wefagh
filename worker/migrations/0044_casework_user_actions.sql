-- 0044: سوابق اقدامات کاربر و پیوند گفت‌وگوهای دستیار با پرونده و خدمت
CREATE TABLE IF NOT EXISTS casework_user_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES case_records(id) ON DELETE SET NULL,
  service_id TEXT REFERENCES case_services(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK(length(action_type) BETWEEN 2 AND 40),
  calculator_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  input_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_casework_user_actions_user_time ON casework_user_actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_casework_user_actions_case_time ON casework_user_actions(case_id, created_at DESC);

ALTER TABLE assistant_threads ADD COLUMN case_id TEXT REFERENCES case_records(id) ON DELETE SET NULL;
ALTER TABLE assistant_threads ADD COLUMN casework_service_id TEXT REFERENCES case_services(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assistant_threads_casework ON assistant_threads(case_id, casework_service_id);
