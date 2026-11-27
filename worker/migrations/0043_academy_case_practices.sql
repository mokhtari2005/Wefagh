-- تمرین‌های پرونده‌محور مستقل در هر کارگاه؛ تعداد رکوردها محدود نیست.
CREATE TABLE IF NOT EXISTS academy_case_practices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  response_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_academy_case_practices_owner
  ON academy_case_practices(user_id, course_id, lesson_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_academy_case_practices_case
  ON academy_case_practices(case_id, id DESC);
