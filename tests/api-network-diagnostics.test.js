import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJson, postForm, postJson, sendJson } from '../site/js/api.js';

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('fetch failures expose only a safe error type, never the raw error message', async () => {
  await withFetch(async () => {
    throw new TypeError('sensitive request details must not escape');
  }, async () => {
    const results = await Promise.all([
      postJson('/api/test', { text: 'private case text' }),
      postForm('/api/test', new FormData()),
      getJson('/api/test'),
      sendJson('DELETE', '/api/test'),
    ]);
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.equal(result.status, 0);
      assert.equal(result.networkError, true);
      assert.equal(result.timeoutError, false);
      assert.equal(result.networkErrorType, 'TypeError');
      assert.equal(Object.hasOwn(result, 'errorMessage'), false);
      assert.equal(JSON.stringify(result).includes('sensitive request details'), false);
    }
  });
});

test('sendJson reports a real timeout without throwing a secondary ReferenceError', async () => {
  await withFetch((_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('private timeout detail', 'AbortError')), { once: true });
  }), async () => {
    const result = await sendJson('PATCH', '/api/test', { value: 1 }, { timeoutMs: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.networkError, true);
    assert.equal(result.timeoutError, true);
    assert.equal(result.networkErrorType, 'AbortError');
  });
});

test('HTTP responses remain distinguishable from fetch-level network failures', async () => {
  await withFetch(async () => ({
    status: 503,
    ok: false,
    url: '/api/test',
    redirected: false,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ error: 'AI_UNAVAILABLE' }),
  }), async () => {
    const result = await postJson('/api/test', {});
    assert.equal(result.status, 503);
    assert.equal(result.networkError, undefined);
    assert.equal(result.data.error, 'AI_UNAVAILABLE');
  });
});
