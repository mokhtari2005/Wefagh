-- Preserve the previous unverified legal text before automatic source refresh.
CREATE TABLE legal_document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_key TEXT NOT NULL UNIQUE,
  law_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  law_type TEXT NOT NULL,
  status TEXT NOT NULL,
  issuing_authority TEXT,
  approved_date TEXT,
  publication_date TEXT,
  effective_date TEXT,
  source_name TEXT,
  source_url TEXT,
  official_source_url TEXT,
  discovery_source_url TEXT,
  notes TEXT,
  content_sha256 TEXT,
  archive_reason TEXT NOT NULL DEFAULT 'automatic_source_refresh',
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_legal_document_versions_slug ON legal_document_versions(slug, archived_at DESC);

CREATE TABLE legal_article_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES legal_document_versions(id) ON DELETE CASCADE,
  original_article_id INTEGER,
  article_number TEXT NOT NULL,
  heading TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX idx_legal_article_versions_version ON legal_article_versions(version_id, article_number);
