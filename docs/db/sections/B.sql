-- Section B: enrollments, lesson_progress (0003)
-- ASCII only. Run as one paste into the D1 Console for wefagh-db. Safe to re-run.
CREATE TABLE IF NOT EXISTS enrollments (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  TEXT    NOT NULL CHECK (length(course_id) BETWEEN 1 AND 64),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    TEXT    NOT NULL CHECK (length(course_id) BETWEEN 1 AND 64),
  lesson_id    TEXT    NOT NULL CHECK (length(lesson_id) BETWEEN 1 AND 64),
  completed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, course_id, lesson_id)
);
