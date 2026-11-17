// پیش از هر `wrangler deploy` (از طریق [build] در wrangler.toml) مهاجرت‌های D1 را اجرا می‌کند.
// اگر مهاجرتی شکست بخورد، کد خروج غیرصفر است و deploy انجام نمی‌شود؛ نسخهٔ قبلی Worker فعال می‌ماند.
// فقط در محیط CI/Workers Builds اجرا می‌شود تا `wrangler dev` محلی روی دیتابیس واقعی چیزی اعمال نکند.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ci = process.env.WORKERS_CI || process.env.CI || process.env.FORCE_D1_MIGRATE;
if (!ci) {
  console.log('مهاجرت D1 رد شد: محیط CI نیست (برای اجرای دستی FORCE_D1_MIGRATE=1 بگذارید).');
  process.exit(0);
}
const workerDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
const res = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'wefagh-db', '--remote', '--config', 'wrangler.toml'], {
  cwd: workerDir,
  stdio: 'inherit',
});
if (res.status !== 0) {
  console.error('مهاجرت D1 ناموفق بود؛ deploy متوقف شد.');
  process.exit(res.status || 1);
}
