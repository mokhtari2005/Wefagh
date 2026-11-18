-- Lightweight index for judicial/legal records where full-text collection is not yet authorized.
-- This table stores metadata and official links only; it does not duplicate protected document text.
CREATE TABLE legal_document_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL REFERENCES legal_document_sources(source_key),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT,
  document_date TEXT,
  issuing_authority TEXT,
  subject TEXT,
  source_url TEXT NOT NULL,
  discovery_source_url TEXT,
  content_sha256 TEXT,
  metadata_json TEXT,
  review_status TEXT NOT NULL DEFAULT 'needs_review' CHECK (review_status = 'needs_review'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_key, source_id)
);
CREATE INDEX idx_legal_document_index_type_date
  ON legal_document_index(document_type, document_date);
CREATE INDEX idx_legal_document_index_number
  ON legal_document_index(document_number, issuing_authority);
CREATE INDEX idx_legal_document_index_review
  ON legal_document_index(review_status, created_at);
