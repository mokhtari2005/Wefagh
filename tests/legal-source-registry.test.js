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
  assert.ok(importer.includes('IMPORT_PHASE = os.getenv("LEGAL_IMPORT_PHASE", "laws")'));
  assert.ok(importer.includes('"laws": {"law", "treaty", "interpretive_law"}'));
  assert.ok(importer.includes('"regulations": {"bylaw", "executive_regulation", "executive_circular", "circular", "executive_resolution", "expediency_council_resolution", "general_policies"}'));
  assert.ok(importer.includes('PHASE_TYPES["all"] = PHASE_TYPES["laws"] | PHASE_TYPES["regulations"] | PHASE_TYPES["judicial"] | PHASE_TYPES["parliamentary"]'));
  assert.ok(importer.includes('"judicial": {'));
  assert.ok(importer.includes('"judicial_session", "fatwa"'));
  assert.ok(importer.includes('"parliamentary": {"bill", "parliamentary_review_opinion"}'));
  assert.ok(importer.includes("documents_excluded_by_phase"));
  assert.ok(importer.includes("phase_excluded_sample"));
  assert.ok(workflow.includes("default: all"));
  assert.ok(workflow.includes("LEGAL_IMPORT_PHASE:"));
  assert.ok(workflow.includes("- all"));
  assert.ok(workflow.includes("  push:"));
  assert.ok(workflow.includes("\'scripts/legal_priority_documents.json\'"));
  assert.ok(workflow.includes("github.event_name == \'push\'"));
  assert.ok(!workflow.includes("Deploy Worker"));
});


test('legal corpus importer classifies statute titles before embedded regulation words and audits actual inserts', () => {
  const importer = readFileSync(new URL('../scripts/import_ekhtebar_corpus.py', import.meta.url), 'utf8');
  const statuteRule = importer.indexOf('if re.match(r"^(?:قانون|قوانین)');
  const bylawRule = importer.indexOf('if "آیین نامه" in text or "آیین‌نامه" in text');
  assert.ok(statuteRule >= 0 && bylawRule > statuteRule, 'a statute title must not become a bylaw merely because it mentions آیین‌نامه');
  assert.ok(importer.includes('def send(statements, inserted):'));
  assert.ok(importer.includes('inserted["laws"]+=changes'));
  assert.ok(importer.includes('inserted["articles"]+=changes'));
  assert.ok(importer.includes('"documents_inserted":inserted["laws"]'));
  assert.ok(importer.includes('"articles_inserted":inserted["articles"]'));
  assert.ok(!importer.includes('"documents_submitted":done'));
});


test('Ekhtbar indexes are registered only as secondary discovery sources', () => {
  const ekhtebar = registry.sources.filter((source) => source.key.startsWith('ekhtebar-'));
  assert.ok(ekhtebar.length >= 7, 'expected separate Ekhtbar indexes for legal document families');
  for (const source of ekhtebar) {
    assert.equal(source.authoritative, false, source.key + ' must not be authoritative');
    assert.equal(source.discovery_only, true, source.key + ' must be discovery-only');
    assert.equal(source.mode, 'manual', source.key + ' must use a supported access mode');
  }
});

test('expanded priority inventory reports broad legal-domain coverage without claiming verification', () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/legal_priority_documents.json', import.meta.url), 'utf8'));
  const keys = new Set(manifest.documents.map((item) => item.key));
  const domains = new Set(manifest.documents.map((item) => item.domain));
  assert.ok(manifest.documents.length >= 120);
  assert.ok(domains.size >= 15);
  assert.ok(keys.has('annual-budget-1405'));
  assert.ok(keys.has('tax-speculation'));
  assert.ok(keys.has('official-registration-transactions'));
  assert.equal(manifest.coverage_note.includes('not an exhaustive inventory'), true);
});

