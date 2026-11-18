import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../site/js/register.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../site/css/styles.css', import.meta.url), 'utf8');

test('ثبت‌نام موفق صفحهٔ مستقل تأیید عضویت را جایگزین فرم می‌کند', () => {
  assert.match(source, /form\.replaceWith\(successPage\)/);
  assert.match(source, /ثبت‌نام شما با موفقیت انجام شد/);
  assert.match(source, /منتظر دریافت ایمیل تأیید/);
  assert.match(source, /پوشه‌های هرزنامه \(Spam\)/);
});

test('صفحهٔ موفقیت امکان ارسال مجدد و رفتن به ورود را دارد', () => {
  assert.match(source, /\/api\/auth\/resend-verification/);
  assert.match(source, /رفتن به صفحهٔ ورود/);
  assert.match(source, /registration-success/);
  assert.match(styles, /\.registration-success/);
});
