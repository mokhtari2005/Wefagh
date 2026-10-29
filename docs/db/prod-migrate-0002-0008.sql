-- Combined manual migration for the production D1 database wefagh-db.
-- Applies worker/migrations/0002_auth.sql .. 0008_registration_profile.sql in order.
-- Source of truth remains worker/migrations/*.sql; this file has the same DDL, comments removed,
-- and is verified to produce an identical schema (see docs/db/README note in the PR).
-- Safe to run more than once: every CREATE uses IF NOT EXISTS. No DROP, ALTER, UPDATE or DELETE.
-- Run in the Cloudflare D1 Console for wefagh-db as ONE complete paste. Do not paste fragments.
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 3 AND 254),
  password_hash     TEXT    NOT NULL,
  display_name      TEXT    NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_verified_at TEXT,
  failed_logins     INTEGER NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until      TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT    NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK (role IN ('super_admin', 'media_editor', 'academy_manager', 'membership_manager', 'tech_admin')),
  granted_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, role)
);
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
CREATE TABLE IF NOT EXISTS moot_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id     TEXT NOT NULL CHECK (length(case_id) BETWEEN 1 AND 64),
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  answers_json TEXT NOT NULL DEFAULT '{}',
  rubric_json  TEXT NOT NULL DEFAULT '[]',
  stage       TEXT NOT NULL DEFAULT 'facts' CHECK (stage IN ('facts', 'answers', 'check', 'result')),
  score       INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_moot_sessions_user_updated ON moot_sessions(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS admin_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('course', 'case')),
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 64),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 140),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  payload_json TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_admin_content_public ON admin_content(kind, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS admin_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('article', 'episode')),
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 100),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 10 AND 600),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  payload_json TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_admin_media_public ON admin_media(kind, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone               TEXT    NOT NULL UNIQUE CHECK (length(phone) = 11 AND substr(phone, 1, 2) = '09'),
  province            TEXT    NOT NULL CHECK (length(province) BETWEEN 2 AND 60),
  city                TEXT    NOT NULL CHECK (length(city) BETWEEN 2 AND 60),
  professional_status TEXT    NOT NULL CHECK (professional_status IN (
                        'trainee', 'lawyer_p1', 'law_student', 'law_graduate', 'academic', 'other')),
  bar_association     TEXT    CHECK (bar_association IS NULL OR length(bar_association) BETWEEN 2 AND 120),
  license_number      TEXT    CHECK (license_number IS NULL OR length(license_number) BETWEEN 1 AND 30),
  license_year        INTEGER CHECK (license_year IS NULL OR license_year BETWEEN 1340 AND 1420),
  experience_band     TEXT    NOT NULL CHECK (experience_band IN ('none', 'under_2', 'from_2_to_5', 'from_5_to_10', 'over_10')),
  practice_areas      TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(practice_areas)),
  learning_goal       TEXT    NOT NULL CHECK (learning_goal IN (
                        'licence_exam', 'daily_practice', 'advocacy_skills', 'research', 'teaching', 'general_knowledge')),
  skill_areas         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(skill_areas)),
  skill_level         TEXT    NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  learning_format     TEXT    NOT NULL CHECK (learning_format IN (
                        'interactive', 'case_based', 'workshop', 'short_lessons', 'hearing_simulation')),
  notes               TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
