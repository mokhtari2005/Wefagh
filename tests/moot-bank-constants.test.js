import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, DIFFICULTIES } from '../worker/src/moot/caseSchema.js';
import { BANK_AREAS, BANK_DIFFICULTY_LABEL } from '../site/js/moot-bank-constants.js';

test('client area list matches the worker list exactly', () => {
  assert.deepEqual([...BANK_AREAS], [...AREAS]);
});

test('client difficulty labels cover every worker difficulty', () => {
  assert.deepEqual(Object.keys(BANK_DIFFICULTY_LABEL).sort(), [...DIFFICULTIES].sort());
});
