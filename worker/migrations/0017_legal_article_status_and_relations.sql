-- وضعیت مستقل هر ماده و ثبت رابطه اصلاح/نسخ میان مواد؛ سابقه متن حفظ می‌شود.
ALTER TABLE legal_articles ADD COLUMN status_note TEXT;
ALTER TABLE legal_articles ADD COLUMN status_source_name TEXT;
ALTER TABLE legal_articles ADD COLUMN status_source_url TEXT;
ALTER TABLE legal_articles ADD COLUMN status_effective_date TEXT;

CREATE TABLE legal_article_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affected_article_id INTEGER NOT NULL REFERENCES legal_articles(id) ON DELETE CASCADE,
  authority_article_id INTEGER NOT NULL REFERENCES legal_articles(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('amends','repeals','replaces','interprets')),
  effective_date TEXT,
  source_note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (affected_article_id <> authority_article_id),
  UNIQUE(affected_article_id, authority_article_id, relation_type)
);
CREATE INDEX idx_legal_article_relations_affected ON legal_article_relations(affected_article_id);
CREATE INDEX idx_legal_article_relations_authority ON legal_article_relations(authority_article_id);
