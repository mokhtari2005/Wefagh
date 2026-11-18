-- Metadata and provenance for all legal document classes, including judicial opinions.
ALTER TABLE legal_laws ADD COLUMN document_number TEXT;
ALTER TABLE legal_laws ADD COLUMN document_date TEXT;
ALTER TABLE legal_laws ADD COLUMN subject TEXT;
ALTER TABLE legal_laws ADD COLUMN official_source_url TEXT;
ALTER TABLE legal_laws ADD COLUMN discovery_source_url TEXT;
ALTER TABLE legal_laws ADD COLUMN content_sha256 TEXT;
ALTER TABLE legal_laws ADD COLUMN source_checked_at TEXT;
CREATE INDEX idx_legal_laws_type_date ON legal_laws(law_type, document_date);
CREATE INDEX idx_legal_laws_number_authority ON legal_laws(document_number, issuing_authority);

CREATE TABLE legal_document_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  document_types TEXT NOT NULL,
  base_url TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'manual' CHECK (access_mode IN ('public_html','public_api','bulk_download','manual')),
  terms_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_checked_at TEXT,
  last_success_at TEXT,
  last_cursor TEXT,
  last_error TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE legal_document_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_document_id INTEGER NOT NULL REFERENCES legal_laws(id) ON DELETE CASCADE,
  target_document_id INTEGER NOT NULL REFERENCES legal_laws(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('amends','repeals','interprets','applies','cites','supersedes','distinguishes','implements','annuls')),
  source_note TEXT NOT NULL,
  effective_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_document_id,target_document_id,relation_type),
  CHECK (source_document_id <> target_document_id)
);
CREATE INDEX idx_legal_document_relations_source ON legal_document_relations(source_document_id);
CREATE INDEX idx_legal_document_relations_target ON legal_document_relations(target_document_id);

INSERT OR IGNORE INTO legal_document_sources
(source_key,title,authority,document_types,base_url,access_mode,notes) VALUES
('judiciary-portal','درگاه ملی قوه قضائیه','قوه قضائیه','judicial_advisory_opinion,judicial_circular,supreme_court_unified_precedent,administrative_court_general_board,administrative_court_specialized_board','https://eadil.com/','public_html','درگاه راهنمای رسمی به مخازن تخصصی؛ پیوندهای هر مجموعه باید جداگانه پایش شوند.'),
('national-judgments','سامانه ملی آرای قضایی','پژوهشگاه قوه قضائیه','judicial_decision,supreme_court_unified_precedent,administrative_court_general_board','https://ara.jri.ac.ir/','public_html','سامانه دارای جستجوی پیشرفته و نمایه مستندات؛ دسترسی ماشینی و شرایط بازنشر باید جداگانه ارزیابی شود.'),
('official-gazette','روزنامه رسمی کشور','روزنامه رسمی جمهوری اسلامی ایران','law,regulation,bylaw,executive_regulation,executive_circular','https://www.rrk.ir/','manual','مرجع انتشار رسمی؛ پیوند مستقیم و امکان دریافت انبوه باید بررسی شود.'),
('national-regulations','سامانه ملی قوانین و مقررات','معاونت حقوقی ریاست جمهوری','law,regulation,bylaw,executive_regulation,executive_circular','https://qavanin.ir/','manual','منبع اصلی مقابله و تنقیح؛ روش دسترسی خودکار باید بررسی شود.'),
('administrative-justice','درگاه دیوان عدالت اداری','دیوان عدالت اداری','administrative_court_unified_precedent,administrative_court_general_board,administrative_court_specialized_board','https://divan-edalat.ir/','public_html','شامل پیوند سامانه ساعد و آرای هیئت عمومی و تخصصی؛ استخراج نیازمند بررسی فنی.'),
('legal-directorate','اداره کل حقوقی قوه قضائیه','قوه قضائیه','judicial_advisory_opinion','https://edarehoquqy.eadl.ir/','public_html','منبع رسمی نظریات؛ دسته‌بندی و مسیر آرشیو باید پایش شود.');
