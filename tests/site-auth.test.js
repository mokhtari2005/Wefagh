import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash } from '../site/js/route.js';
import { messageFor, REGISTER_SENT } from '../site/js/auth-messages.js';

test('مسیر ساده و خالی درست تجزیه می‌شود', () => {
  assert.deepEqual(parseHash(''), { path: '/', params: {} });
  assert.deepEqual(parseHash('#/'), { path: '/', params: {} });
  assert.deepEqual(parseHash('#/about'), { path: '/about', params: {} });
});

test('پارامترهای query از hash خوانده می‌شوند (لینک تأیید ایمیل)', () => {
  const r = parseHash('#/verify?token=AbC-_123');
  assert.equal(r.path, '/verify');
  assert.equal(r.params.token, 'AbC-_123');
});

test('اسلش انتهایی حذف می‌شود و مسیر بدون # هم پذیرفته می‌شود', () => {
  assert.equal(parseHash('#/account/').path, '/account');
  assert.equal(parseHash('account').path, '/account');
});

test('پارامتر mode برای نمایش فرم ثبت‌نام خوانده می‌شود', () => {
  assert.equal(parseHash('#/account?mode=register').params.mode, 'register');
});

test('کدهای خطای شناخته‌شده پیام فارسی دارند', () => {
  for (const code of ['INVALID_CREDENTIALS', 'EMAIL_NOT_VERIFIED', 'ACCOUNT_LOCKED', 'INVALID_TOKEN', 'NETWORK']) {
    const msg = messageFor(code);
    assert.ok(msg.length > 10, `پیام برای ${code}`);
    assert.match(msg, /[؀-ۿ]/);
  }
});

test('کد ناشناخته یا خالی پیام عمومی می‌گیرد و جزئیات فنی نشان داده نمی‌شود', () => {
  assert.equal(messageFor('SOMETHING_ELSE'), messageFor(undefined));
  assert.ok(!messageFor('DB_WRITE_FAILED').includes('DB'));
});

test('پیام ثبت‌نام عمداً وجود یا نبود حساب را فاش نمی‌کند', () => {
  assert.ok(!/تکراری|قبلاً|وجود دارد|ثبت شده است/.test(REGISTER_SENT));
  assert.match(REGISTER_SENT, /اگر این نشانی معتبر باشد/);
});


test('صفحهٔ بازیابی مرحلهٔ امن خطای پایگاه داده را همراه کد پیگیری نمایش می‌دهد', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../site/js/account.js', import.meta.url), 'utf8');
  for (const stage of ['user_lookup', 'recent_token_lookup', 'invalidate_old_tokens', 'generate_and_hash_token', 'insert_reset_token']) {
    assert.ok(source.includes(stage), `مرحلهٔ ${stage} باید قابل تشخیص باشد`);
  }
  assert.match(source, /res\.data\?\.stage/);
  assert.match(source, /res\.data\?\.requestId/);
});
