// مدیریت حساب کاربر واردشده: تغییر رمز عبور و ویرایش پروفایل.
// اصول: هر دو مسیر نیاز به نشست معتبر دارند؛ رمز هرگز لاگ یا بازگردانده نمی‌شود؛
// پس از تغییر رمز، نشست‌های دیگر کاربر باطل می‌شوند و نشست فعلی باقی می‌ماند.
import { json, readJsonBody, readCookie, SESSION_COOKIE } from '../http.js';
import { hashPassword, verifyPassword, validatePasswordPolicy } from './password.js';
import { hashToken } from './token.js';
import { validateProfile } from './profile.js';
import { currentUser, getProfile } from './routes.js';

/** @returns {Promise<{ok:true, row:{password_hash:string}} | {ok:false, response:Response}>} */
async function loadPasswordHash(env, userId) {
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?1').bind(userId).first();
  if (!row?.password_hash) return { ok: false, response: json({ ok: false, error: 'UNAUTHENTICATED' }, 401) };
  return { ok: true, row };
}

export async function changePassword(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body && typeof parsed.body === 'object' ? parsed.body : {};
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  const policy = validatePasswordPolicy(newPassword);
  if (!policy.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { newPassword: policy.error } }, 422);
  if (newPassword === currentPassword) {
    return json({ ok: false, error: 'VALIDATION_FAILED', errors: { newPassword: 'رمز جدید باید با رمز فعلی متفاوت باشد.' } }, 422);
  }

  const stored = await loadPasswordHash(env, user.id);
  if (!stored.ok) return stored.response;
  if (!(await verifyPassword(currentPassword, stored.row.password_hash))) {
    return json({ ok: false, error: 'WRONG_PASSWORD' }, 400);
  }

  await env.DB
    .prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2')
    .bind(await hashPassword(newPassword), user.id)
    .run();

  // نشست فعلی بماند؛ همهٔ نشست‌های دیگر این کاربر باطل شوند.
  const current = readCookie(request, SESSION_COOKIE);
  const currentHash = current ? await hashToken(current) : '';
  await env.DB
    .prepare('DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2')
    .bind(user.id, currentHash)
    .run();

  return json({ ok: true });
}

export async function updateProfile(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);

  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const check = validateProfile(parsed.body?.profile ?? parsed.body);
  if (!check.ok) return json({ ok: false, error: 'VALIDATION_FAILED', errors: check.errors }, 422);
  const p = check.value;

  // شمارهٔ موبایل نباید متعلق به کاربر دیگری باشد.
  const taken = await env.DB
    .prepare('SELECT user_id FROM user_profiles WHERE phone = ?1 AND user_id != ?2')
    .bind(p.phone, user.id)
    .first();
  if (taken) return json({ ok: false, error: 'VALIDATION_FAILED', errors: { phone: 'این شماره قبلاً ثبت شده است.' } }, 422);

  const nowIso = new Date().toISOString();
  await env.DB
    .prepare(`INSERT INTO user_profiles (user_id, phone, province, city, professional_status, bar_association,
        license_number, license_year, experience_band, practice_areas, learning_goal, skill_areas, skill_level,
        learning_format, notes, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
      ON CONFLICT(user_id) DO UPDATE SET
        phone = excluded.phone, province = excluded.province, city = excluded.city,
        professional_status = excluded.professional_status, bar_association = excluded.bar_association,
        license_number = excluded.license_number, license_year = excluded.license_year,
        experience_band = excluded.experience_band, practice_areas = excluded.practice_areas,
        learning_goal = excluded.learning_goal, skill_areas = excluded.skill_areas,
        skill_level = excluded.skill_level, learning_format = excluded.learning_format,
        notes = excluded.notes, updated_at = excluded.updated_at`)
    .bind(user.id, p.phone, p.province, p.city, p.professionalStatus, p.barAssociation, p.licenseNumber,
      p.licenseYear, p.experienceBand, JSON.stringify(p.practiceAreas), p.learningGoal,
      JSON.stringify(p.skillAreas), p.skillLevel, p.learningFormat, p.notes, nowIso)
    .run();

  const profile = await getProfile(env, user.id);
  return json({ ok: true, profile });
}
