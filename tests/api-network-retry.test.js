import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postJson } from '../site/js/api.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('postJson retries a transient network TypeError and then succeeds', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError('Load failed');
    return jsonResponse({ ok: true, text: 'پاسخ' });
  };
  try {
    const res = await postJson('/api/ai/assistant', { message: 'سلام' }, { timeoutMs: 5000, networkRetries: 2 });
    assert.equal(calls, 3);
    assert.equal(res.ok, true);
    assert.equal(res.data.text, 'پاسخ');
  } finally {
    globalThis.fetch = original;
  }
});

test('postJson does not retry by default', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/health')) return jsonResponse({ ok: true });
    calls += 1;
    throw new TypeError('Load failed');
  };
  try {
    const res = await postJson('/api/ai/assistant', {}, { timeoutMs: 5000 });
    assert.equal(calls, 1);
    assert.equal(res.networkError, true);
    assert.equal(res.apiProbe.status, 'reachable');
  } finally {
    globalThis.fetch = original;
  }
});

test('postJson does not retry HTTP errors', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return jsonResponse({ ok: false, error: 'AI_UNAVAILABLE' }, 503); };
  try {
    const res = await postJson('/api/ai/assistant', {}, { timeoutMs: 5000, networkRetries: 2 });
    assert.equal(calls, 1);
    assert.equal(res.status, 503);
  } finally {
    globalThis.fetch = original;
  }
});
