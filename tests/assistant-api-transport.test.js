import test from 'node:test';
import assert from 'node:assert/strict';
import { postJson, postForm } from '../site/js/api.js';

const jsonResponse = (body, headers = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
});

test('assistant JSON transport reuses a trace id across bounded TypeError retries', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: new Headers(init.headers) });
    if (String(url) === '/api/ai/assistant' && calls.length < 3) throw new TypeError('Load failed');
    return jsonResponse({ ok: true }, { 'x-request-id': 'worker-trace-12345678' });
  };
  try {
    const result = await postJson('/api/ai/assistant', { message: 'آزمون' }, { networkRetries: 2 });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 3);
    const ids = calls.map(call => call.headers.get('x-client-request-id'));
    assert.ok(ids[0]);
    assert.equal(new Set(ids).size, 1);
    assert.deepEqual(calls.map(call => call.headers.get('x-client-request-attempt')), ['1', '2', '3']);
    assert.equal(result.requestId, 'worker-trace-12345678');
    assert.equal(result.requestAttempt, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('assistant JSON transport probes health after the final network failure', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url) === '/api/ai/assistant') throw new TypeError('Load failed');
    if (String(url) === '/api/health') return jsonResponse({ ok: true });
    throw new Error('Unexpected URL');
  };
  try {
    const result = await postJson('/api/ai/assistant', { message: 'آزمون' });
    assert.equal(result.networkError, true);
    assert.equal(result.networkErrorType, 'TypeError');
    assert.equal(result.apiProbe.status, 'reachable');
    assert.ok(result.requestId);
    assert.deepEqual(urls, ['/api/ai/assistant', '/api/health']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('assistant multipart transport probes the correct endpoint after a network failure', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url) === '/api/ai/assistant') throw new TypeError('Load failed');
    if (String(url) === '/api/health') return jsonResponse({ ok: true });
    throw new Error('Unexpected URL');
  };
  try {
    const form = new FormData();
    form.append('message', 'آزمون');
    const result = await postForm('/api/ai/assistant', form);
    assert.equal(result.networkError, true);
    assert.equal(result.apiProbe.status, 'reachable');
    assert.ok(result.requestId);
    assert.deepEqual(urls, ['/api/ai/assistant', '/api/health']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
