-- بانک قوانین و مقررات؛ متن‌ها ابتدا در وضعیت نیازمند بررسی ثبت می‌شوند.
CREATE TABLE legal_laws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  law_type TEXT NOT NULL DEFAULT 'law',
  issuing_authority TEXT,
  approved_date TEXT,
  publication_date TEXT,
  effective_date TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','verified','amended','repealed')),
  source_name TEXT,
  source_url TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE legal_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_id INTEGER NOT NULL REFERENCES legal_laws(id) ON DELETE CASCADE,
  article_number TEXT NOT NULL,
  heading TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','verified','amended','repealed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(law_id, article_number)
);
CREATE INDEX idx_legal_laws_status_title ON legal_laws(status, title);
CREATE INDEX idx_legal_articles_law_status ON legal_articles(law_id, status);
