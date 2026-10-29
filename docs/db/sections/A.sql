-- Section A: users, sessions, email_tokens, user_roles (0002)
-- ASCII only. Run as one paste into the D1 Console for wefagh-db. Safe to re-run.
-- Combined manual migration for the production D1 database wefagh-db.
-- Applies worker/migrations/0002_auth.sql .. 0008_registration_profile.sql in order.
-- Source of truth remains worker/migrations/*.sql; this file has the same DDL, comments removed,
-- and is verified to produce an identical schema (see the pull request description).
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
