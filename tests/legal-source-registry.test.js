import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync(new URL('../scripts/legal_document_sources.json', import.meta.url), 'utf8'));
const bankSource = readFileSync(new URL('../worker/src/legal-bank.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../worker/migrations/0027_legal_document_metadata_and_sources.sql', import.meta.url), 'utf8');

test('legal source access modes match the D1 registry constraint', () => {
  const check = migration.match(/access_mode TEXT NOT NULL DEFAULT 'manual' CHECK \(access_mode IN \(([^)]+)\)\)/);
  assert.ok(check, 'D1 access_mode CHECK constraint must exist');
  const allowed = new Set([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  for (const source of registry.sources) {
    assert.ok(allowed.has(source.mode), 'unsupported access mode for ' + source.key + ': ' + source.mode);
  }
});

test('all configured source document types are accepted by the legal-bank API', () => {
  const block = bankSource.match(/const TYPES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(block, 'legal-bank TYPES allowlist must exist');
  const allowed = new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  for (const source of registry.sources) {
    for (const type of source.types) {
      assert.ok(allowed.has(type), 'unsupported document type for ' + source.key + ': ' + type);
    }
  }
});

test('source keys are unique and every source has an official authority and URL', () => {
  const keys = registry.sources.map((source) => source.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const source of registry.sources) {
    assert.ok(source.authority && source.authority.trim(), 'missing authority: ' + source.key);
    assert.match(source.url, /^https:\/\//, 'source URL must use HTTPS: ' + source.key);
    assert.ok(Array.isArray(source.types) && source.types.length > 0, 'missing document types: ' + source.key);
  }
});


test("legal corpus import defaults to laws and separates the regulations phase", () => {
  const importer = readFileSync(new URL("../scripts/import_ekhtebar_corpus.py", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/import-legal-corpus.yml", import.meta.url), "utf8");
  assert.match(importer, /IMPORT_PHASE = os\\.getenv\\("LEGAL_IMPORT_PHASE", "laws"\\)/);
  assert.match(importer, /"laws": \\{"law"\\}/);
  assert.match(importer, /"regulations": \\{"bylaw", "executive_regulation", "executive_circular"\\}/);
  assert.match(importer, /documents_excluded_by_phase/);
  assert.match(importer, /phase_excluded_sample/);
  assert.match(workflow, /default: laws/);
  assert.match(workflow, /LEGAL_IMPORT_PHASE:/);
});
