import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('membership management is routed and guarded by membership roles', async () => {
  const source = await readFile(new URL('../worker/src/admin-membership.js', import.meta.url), 'utf8');
  assert.match(source, /membership_manager/);
  assert.match(source, /membership_status/);
  assert.match(source, /decision === 'rejected'/);
  assert.match(source, /hashPassword/);
});

test('new registrations wait for admin approval while existing members are preserved', async () => {
  const migration = await readFile(new URL('../worker/migrations/0024_membership_approval.sql', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../worker/src/auth/routes.js', import.meta.url), 'utf8');
  assert.match(migration, /DEFAULT 'pending'/);
  assert.match(migration, /UPDATE users SET membership_status='approved'/);
  assert.match(auth, /membership_status = 'approved'/);
});
