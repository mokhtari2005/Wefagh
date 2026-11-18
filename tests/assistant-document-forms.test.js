import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_DOCUMENT_IDS, ASSISTANT_CONTRACT_FORM_IDS, assistantMenuPage, assistantDocumentPage } from '../site/js/assistant-forms.js';

test('assistant document selector exposes dedicated pages for every supported document', () => {
  assert.ok(ASSISTANT_DOCUMENT_IDS.length >= 10);
  assert.equal(new Set(ASSISTANT_DOCUMENT_IDS).size, ASSISTANT_DOCUMENT_IDS.length);
  for (const id of ['petition', 'defense', 'appeal', 'cassation', 'enforcement', 'notice', 'criminal_complaint', 'reply', 'judicial_request', 'letter', 'other']) {
    assert.ok(ASSISTANT_DOCUMENT_IDS.includes(id), id);
  }
  assert.equal(typeof assistantMenuPage, 'function');
  assert.equal(typeof assistantDocumentPage, 'function');
});

test('contract form catalog contains subtype-specific fields for common domestic contracts', () => {
  for (const id of ['lease', 'real_estate_sale', 'vehicle_sale', 'construction', 'employment', 'nda', 'software', 'loan', 'supply', 'consulting']) {
    assert.ok(ASSISTANT_CONTRACT_FORM_IDS.includes(id), id);
  }
});
