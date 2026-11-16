-- مهاجرت ۰۰۱۳: ذخیره پاسخ تمرین و ارزیابی آزمونک‌های دوره.
CREATE TABLE IF NOT EXISTS lesson_assessments (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id     TEXT NOT NULL CHECK (length(course_id) BETWEEN 1 AND 64),
  lesson_id     TEXT NOT NULL CHECK (length(lesson_id) BETWEEN 1 AND 64),
  answer_index  INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 10),
  response_text TEXT NOT NULL CHECK (length(response_text) BETWEEN 30 AND 12000),
  score         INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed        INTEGER NOT NULL CHECK (passed IN (0, 1)),
  submitted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, course_id, lesson_id)
);
