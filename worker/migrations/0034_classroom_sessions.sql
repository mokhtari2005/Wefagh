-- 0034: live classroom sessions and attendance; recordings are not stored.
CREATE TABLE IF NOT EXISTS classroom_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1500),
  provider TEXT NOT NULL CHECK(provider IN ('jitsi','google_meet')),
  room_name TEXT,
  meeting_url TEXT,
  guest_enabled INTEGER NOT NULL DEFAULT 0 CHECK(guest_enabled IN (0,1)),
  guest_code_hash TEXT,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 15 AND 240),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_schedule ON classroom_sessions(status, starts_at);
CREATE TABLE IF NOT EXISTS classroom_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name TEXT,
  guest_token_hash TEXT,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  left_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
  CHECK((user_id IS NOT NULL AND guest_name IS NULL AND guest_token_hash IS NULL) OR
        (user_id IS NULL AND guest_name IS NOT NULL AND guest_token_hash IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_attendance_member ON classroom_attendance(session_id,user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_attendance_guest ON classroom_attendance(session_id,guest_token_hash) WHERE guest_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classroom_attendance_session ON classroom_attendance(session_id,joined_at);
