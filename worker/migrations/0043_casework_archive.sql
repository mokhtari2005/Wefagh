-- 0043: پرونده‌های حرفه‌ای، خدمات، اسناد نسخه‌دار و گردش کار مستقل از تمرین‌های آموزشی
CREATE TABLE IF NOT EXISTS case_records (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 180),
  case_number TEXT NOT NULL DEFAULT '' CHECK(length(case_number) <= 120),
  parties_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '' CHECK(length(subject) <= 500),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 8000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','waiting_upload','waiting_analysis','ready_next','completed','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_case_records_user_activity ON case_records(user_id, deleted_at, archived_at, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_records_user_status ON case_records(user_id, status, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS case_services (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK(length(service_type) BETWEEN 2 AND 60),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('draft','in_progress','waiting_upload','waiting_analysis','ready_next','completed','archived')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_case_services_case_time ON case_services(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_services_user_time ON case_services(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS case_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES case_services(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 180),
  original_name TEXT NOT NULL CHECK(length(original_name) BETWEEN 1 AND 180),
  document_type TEXT NOT NULL DEFAULT 'attachment' CHECK(document_type IN ('attachment','draft','final','evidence','contract','correspondence','report','other')),
  source_kind TEXT NOT NULL DEFAULT 'upload' CHECK(source_kind IN ('upload','generated','imported')),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 15728640),
  storage_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','final','archived','deleted')),
  version_group_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK(version_number >= 1),
  parent_document_id TEXT REFERENCES case_documents(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_case_documents_case_time ON case_documents(case_id, deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_documents_service ON case_documents(service_id, deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_documents_version ON case_documents(version_group_id, version_number DESC);

CREATE TABLE IF NOT EXISTS case_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES case_records(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES case_services(id) ON DELETE SET NULL,
  document_id TEXT REFERENCES case_documents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 2 AND 60),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_case_timeline_case_time ON case_timeline(case_id, id DESC);
