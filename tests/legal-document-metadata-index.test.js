import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../worker/migrations/0029_legal_document_metadata_index.sql', import.meta.url), 'utf8');
const source = readFileSync(new URL('../worker/src/legal-bank.js', import.meta.url), 'utf8');

test('metadata index is separate from full-text legal articles', () => {
  assert.match(migration, /CREATE TABLE legal_document_index/);
  assert.match(migration, /UNIQUE\(source_key, source_id\)/);
  assert.match(migration, /review_status TEXT NOT NULL DEFAULT 'needs_review'/);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*legal_articles/i);
  assert.doesNotMatch(migration, /body\s+TEXT/i);
});

test('metadata intake is admin-only, bounded, and limited to registered HTTPS sources', () => {
  const route = source.slice(source.indexOf("if (path === '/api/admin/legal-bank/metadata')"), source.indexOf("if (path === '/api/admin/legal-bank/articles')"));
  assert.match(route, /requireAdmin\(request, env\)/);
  assert.match(route, /readLargeJson\(request, 16\*1024\)/);
  assert.match(route, /SELECT base_url,enabled FROM legal_document_sources/);
  assert.match(route, /target\.origin !== base\.origin/);
  assert.match(route, /target\.protocol !== 'https:'/);
  assert.match(route, /DUPLICATE_SOURCE_RECORD/);
  assert.match(route, /reviewStatus:'needs_review'/);
});

test('metadata intake does not expose a network crawler or automatic full-text import', () => {
  const route = source.slice(source.indexOf("if (path === '/api/admin/legal-bank/metadata')"), source.indexOf("if (path === '/api/admin/legal-bank/articles')"));
  assert.doesNotMatch(route, /fetch\s*\(/);
  assert.doesNotMatch(route, /legal_articles/);
});
