-- مهاجرت ۰۰۰۲: کاربران، نشست‌ها، توکن‌های ایمیلی و نقش‌ها.
-- در این مرحله فقط ساختار جداول است؛ منطق ثبت‌نام و ورود در worker/src/auth/ است.

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

-- نشست: شناسه = هش SHA-256 توکن. خود توکن هرگز در دیتابیس ذخیره نمی‌شود.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- توکن‌های یکبارمصرف ایمیلی (تأیید حساب، بازیابی رمز). فقط هش ذخیره می‌شود.
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT    NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- نقش‌ها. ادمین اصلی فعلاً تمام نقش‌ها را دارد.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK (role IN ('super_admin', 'media_editor', 'academy_manager', 'membership_manager', 'tech_admin')),
  granted_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, role)
);
