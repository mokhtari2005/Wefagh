-- Section C: deadlines (0004)
-- ASCII only. Run as one paste into the D1 Console for wefagh-db. Safe to re-run.
CREATE TABLE IF NOT EXISTS deadlines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL CHECK (length(title) BETWEEN 2 AND 150),
  case_no    TEXT    CHECK (case_no IS NULL OR length(case_no) <= 60),
  due_date   TEXT    NOT NULL CHECK (length(due_date) = 10),
  kind       TEXT    NOT NULL DEFAULT 'other' CHECK (kind IN ('hearing', 'objection', 'appeal', 'filing', 'other')),
  note       TEXT    CHECK (note IS NULL OR length(note) <= 1000),
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_deadlines_user_due ON deadlines (user_id, due_date);
