// Regression tests for stage allocation and separate attorney tax stamps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAttorneyForm } from '../site/js/calc/attorney-form.js';

test('non-final financial tariff is split 60/40 between first instance and appeal', () => {
  const result = computeAttorneyForm({ subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 1_000_000_000, result: 'none' });
  assert.equal(result.ok, true);
  assert.equal(result.stageFees.first + result.stageFees.appeal, result.feeTotal);
  assert.equal(result.stageFees.first, Math.round(result.feeTotal * 0.6));
  assert.equal(result.stageFees.appeal, result.feeTotal - result.stageFees.first);
});

test('final judgment by value does not invent an appeal-stage fee', () => {
  const result = computeAttorneyForm({ subject: 'attorney', caseType: 'financial', judgment: 'final', amount: 100_000_000, result: 'none' });
  assert.equal(result.ok, true);
  assert.equal(result.stageFees.first, result.feeTotal);
  assert.equal(result.stageFees.appeal, 0);
});

test('first-instance dismissal share is calculated from the 60 percent first-instance tariff', () => {
  const result = computeAttorneyForm({ subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 1_000_000_000, result: 'dismissBefore' });
  assert.equal(result.ok, true);
  const fullTariff = computeAttorneyForm({ subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount: 1_000_000_000, result: 'none' });
  assert.equal(result.stageFees.first, Math.round(fullTariff.feeTotal * 0.6 / 4));
  assert.equal(result.stageFees.appeal, 0);
});
