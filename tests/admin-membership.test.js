import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMembershipApprovalEmail } from '../worker/src/admin-membership.js';

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
  assert.match(auth, /membershipApproved/);
  assert.match(auth, /membership_status/);
});

test('membership approval email has a personalized welcome and login link', async () => {
  const source = await readFile(new URL('../worker/src/admin-membership.js', import.meta.url), 'utf8');
  assert.match(source, /buildMembershipApprovalEmail/);
  assert.match(source, /تبریک و خوش‌آمدگویی/);
  assert.match(source, /approval-email/);
  assert.match(source, /emailSent/);
});

test('approval email personalizes salutation and includes member details and login link', () => {
  const text = buildMembershipApprovalEmail({
    displayName: 'سارا احمدی',
    gender: 'female',
    position: 'lawyer',
    membershipNo: 'MLA-2042',
    loginUrl: 'https://mokhtari.ir/#/login',
  });
  assert.match(text, /سرکار خانم سارا احمدی/);
  assert.match(text, /وکیل محترم دادگستری/);
  assert.match(text, /MLA-2042/);
  assert.match(text, /https:\/\/mokhtari\.ir\/#\/login/);
  assert.match(text, /مورد تأیید مدیر آکادمی قرار گرفته است/);
});
