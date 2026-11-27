import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordServerFault, sanitizeFaultMessage } from '../worker/src/diagnostics.js';

test('sanitizeFaultMessage removes emails and long tokens and truncates', () => {
  const out = sanitizeFaultMessage('D1_ERROR: failed for ali@example.com token abcdefghijklmnopqrstuvwxyz0123456789 ' + 'x'.repeat(300));
  assert.ok(!out.includes('ali@example.com'));
  assert.ok(!out.includes('abcdefghijklmnopqrstuvwxyz'));
  assert.ok(out.length <= 160);
  assert.ok(out.includes('[email]'));
});

test('recordServerFault stores a sanitized event and never throws', async () => {
  const calls = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); } }) }) } };
  await recordServerFault(env, { route: '/api/auth/request-password-reset', error: Object.assign(new Error('boom for a@b.co'), { name: 'D1_ERROR' }) });
  assert.equal(calls.length, 1);
  const [, route, code, detail] = calls[0].args;
  assert.equal(route, '/api/auth/request-password-reset');
  assert.equal(code, 'FAULT_D1_ERROR');
  assert.ok(!detail.includes('a@b.co'));

  const broken = { DB: { prepare: () => { throw new Error('db down'); } } };
  await assert.doesNotReject(() => recordServerFault(broken, { route: '/x', error: new Error('y') }));
  await assert.doesNotReject(() => recordServerFault({}, { route: '/x', error: new Error('y') }));
});
