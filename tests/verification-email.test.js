import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVerificationEmailText } from '../worker/src/auth/routes.js';

test('ایمیل تأیید برای وکیل مرد با نام کامل و سمت شخصی‌سازی می‌شود', () => {
  const text = buildVerificationEmailText({
    displayName: 'علی رضایی',
    gender: 'male',
    position: 'lawyer',
    link: 'https://mokhtari.ir/#/verify?token=test-token',
  });
  assert.match(text, /جناب آقای علی رضایی، وکیل دادگستری محترم/);
  assert.match(text, /روی پیوند زیر کلیک کنید/);
  assert.match(text, /تا اعلام نتیجه و تأیید نهایی عضویت از سوی مدیر آکادمی/);
  assert.match(text, /https:\/\/mokhtari\.ir/);
});

test('ایمیل تأیید برای خانم کارآموز وکالت خطاب و سمت درست دارد', () => {
  const text = buildVerificationEmailText({
    displayName: 'مریم احمدی',
    gender: 'female',
    position: 'trainee',
    link: 'https://example.test/verify',
  });
  assert.match(text, /سرکار خانم مریم احمدی، کارآموز وکالت محترم/);
});

test('برای داده‌های قدیمی فاقد جنسیت یا سمت، خطاب محترمانه و امن می‌ماند', () => {
  const text = buildVerificationEmailText({
    displayName: 'رضا محمدی',
    link: 'https://example.test/verify',
  });
  assert.match(text, /رضا محمدی، عضو ارجمند آکادمی/);
});
