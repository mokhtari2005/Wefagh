-- 0036: site-managed classroom instructors and per-session host assignment.
ALTER TABLE classroom_sessions ADD COLUMN instructor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS classroom_instructors (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by INTEGER NOT NULL REFERENCES users(id),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_classroom_instructors_active ON classroom_instructors(revoked_at,user_id);
