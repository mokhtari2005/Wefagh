-- Reconcile source type labels after the legal-bank API taxonomy was expanded.
-- Migration 0027 is already applied in production and must remain immutable.
UPDATE legal_document_sources
SET document_types = replace(document_types, 'executive_regulation,circular', 'executive_regulation,executive_circular'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE source_key IN ('official-gazette','national-regulations')
  AND document_types LIKE '%executive_regulation,circular%';
