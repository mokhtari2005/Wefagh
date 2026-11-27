-- Queue changed source documents for controlled legal review.
-- Existing verified text is never overwritten by an unattended source refresh.
CREATE TABLE legal_document_update_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_id INTEGER NOT NULL REFERENCES legal_laws(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  previous_sha256 TEXT,
  proposed_sha256 TEXT NOT NULL,
  proposed_payload_json TEXT NOT NULL,
  discovery_source_url TEXT,
  official_source_url TEXT,
  review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('needs_review','accepted','rejected')),
  detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  reviewed_by INTEGER,
  review_note TEXT,
  UNIQUE(slug, proposed_sha256)
);
CREATE INDEX idx_legal_update_queue_status ON legal_document_update_queue(review_status, detected_at DESC);
