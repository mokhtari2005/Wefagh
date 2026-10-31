// فهرست یکپارچهٔ بانک پرونده‌های موت‌کورت (۲۰۷ پرونده در ۱۵ دسته).
// همهٔ پرونده‌ها با وضعیت پیش‌نویس وارد پایگاه داده می‌شوند و تا بررسی حقوقی منتشر نمی‌شوند.
import b01 from './batch-01.js';
import b02 from './batch-02.js';
import b03 from './batch-03.js';
import b04 from './batch-04.js';
import b05 from './batch-05.js';
import b06 from './batch-06.js';
import b08 from './batch-08.js';
import b09 from './batch-09.js';
import b10 from './batch-10.js';
import b11 from './batch-11.js';
import b12 from './batch-12.js';
import b13 from './batch-13.js';
import b14 from './batch-14.js';
import b15 from './batch-15.js';
import b16 from './batch-16.js';

export const BANK_REVIEW_LABEL = 'پیش‌نویس ـ در انتظار بررسی حقوقی';
export const BANK_CASES = Object.freeze([
  ...b01, ...b02, ...b03, ...b04, ...b05, ...b06, ...b08,
  ...b09, ...b10, ...b11, ...b12, ...b13, ...b14, ...b15, ...b16,
]);
