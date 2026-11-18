import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSyntheticDiagnostic } from '../worker/src/diagnostic-self-test.js';

test('گزارش مصنوعی آزمون سلامت فقط با نشانگر صریح synthetic معتبر است', () => {
  const payload = {
    category: 'javascript',
    component: 'site',
    route: '/__health_test__',
    errorCode: 'SELF_TEST',
    synthetic: true,
  };
  assert.equal(validateSyntheticDiagnostic(payload), true);
  assert.equal(validateSyntheticDiagnostic({ ...payload, synthetic: false }), false);
  assert.equal(validateSyntheticDiagnostic({ ...payload, route: '/' }), false);
  assert.equal(validateSyntheticDiagnostic({ ...payload, errorCode: 'REAL_ERROR' }), false);
  assert.equal(validateSyntheticDiagnostic(null), false);
});
