-- Re-run the same immutable DOTIC snapshot once to repair article rows
-- skipped by the first import because of article-number uniqueness collisions.
UPDATE legal_document_sources
SET last_cursor=NULL,last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE source_key='iran-laws-graphrag';
