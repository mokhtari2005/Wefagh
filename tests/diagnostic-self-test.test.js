import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSyntheticDiagnostic, githubRead } from '../worker/src/diagnostic-self-test.js';

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


test('درخواست GitHub سرآیند User-Agent معتبر می‌فرستد', async () => {
  let sentHeaders;
  const result = await githubRead({
    GH_REPAIR_TOKEN: 'test-token-value-1234567890',
    fetchImpl: async (_url, options) => {
      sentHeaders = options.headers;
      return new Response(JSON.stringify({ full_name: 'mokhtari2005/Wefagh' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }, '/repos/mokhtari2005/Wefagh');
  assert.equal(result.full_name, 'mokhtari2005/Wefagh');
  assert.equal(sentHeaders['user-agent'], 'Mokhtari-Law-Academy-Diagnostics');
  assert.equal(sentHeaders.accept, 'application/vnd.github+json');
});
