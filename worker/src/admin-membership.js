// مدیریت درخواست‌های عضویت و ثبت دستی اعضا؛ فقط مدیران دارای نقش مرتبط.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';
import { hashPassword, validatePasswordPolicy } from './auth/password.js';
import { normalizeEmail, cleanText } from './validate.js';

async function requireMembershipAdmin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ ok: false, error: 'UNAUTHENTICATED' }, 401) };
  if (!user.roles.some((r) => ['admin', 'super_admin', 'membership_manager'].includes(r))) {
    return { response: json({ ok: false, error: 'FORBIDDEN' }, 403) };
  }
  return { user };
}
async function allocateMembershipNo(env, userId) {
  const allocated = await env.DB.prepare(
    'UPDATE membership_sequence SET next_value = next_value + 1 WHERE id = 1 RETURNING next_value - 1 AS value'
  ).first();
  const value = Number.isInteger(allocated?.value) ? allocated.value : 1999 + Number(userId);
  return `MLA-${value}`;
}
async function sendVerification(env, email) {
  const req = new Request('https://internal.invalid/api/auth/resend-verification', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  });
  const { resendVerification } = await import('./auth/routes.js');
  return resendVerification(req, env);
}
export async function handleAdminMembership(request, env, path) {
  const allowed = ['/api/admin/members', '/api/admin/members/decision', '/api/admin/members/manual'];
  if (!allowed.includes(path)) return null;
  const method = path === allowed[0] ? 'GET' : 'POST';
  if (request.method !== method) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: method });
  if (!env.DB) return json({ ok: false, error: 'DB_NOT_CONFIGURED' }, 503);
  const access = await requireMembershipAdmin(request, env);
  if (access.response) return access.response;
  if (path === allowed[0]) {
    const rows = await env.DB.prepare(`SELECT u.id,u.email,u.display_name AS displayName,u.gender,u.phone AS mobile,u.membership_no AS membershipNo,
      u.professional_title AS professionalTitle,u.position,u.status,u.membership_status AS membershipStatus,
      u.email_verified_at AS emailVerifiedAt,u.created_at AS createdAt,
      p.province,p.city,p.professional_status AS professionalStatus,p.bar_association AS barAssociation
      FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id ORDER BY
      CASE u.membership_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, u.created_at DESC LIMIT 500`).all();
    return json({ ok: true, items: rows.results || [] });
  }
  const parsed = await readJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body || {};
  if (path === allowed[1]) {
    const id = Number(body.userId);
    const decision = body.decision;
    if (!Number.isSafeInteger(id) || id < 1 || !['approved','rejected'].includes(decision)) {
      return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    }
    const user = await env.DB.prepare('SELECT id,membership_status FROM users WHERE id=?1').bind(id).first();
    if (!user) return json({ ok: false, error: 'USER_NOT_FOUND' }, 404);
    await env.DB.prepare('UPDATE users SET membership_status=?1 WHERE id=?2').bind(decision,id).run();
    if (decision === 'rejected') await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(id).run();
    return json({ ok: true, membershipStatus: decision });
  }
  const email = normalizeEmail(body.email);
  const displayName = cleanText(body.displayName);
  const title = cleanText(body.professionalTitle);
  const position = cleanText(body.position);
  const password = typeof body.password === 'string' ? body.password : '';
  const policy = validatePasswordPolicy(password);
  if (!email || displayName.length < 2 || displayName.length > 100 || (title && (title.length < 2 || title.length > 100)) || (position && (position.length < 2 || position.length > 100)) || !policy.ok) {
    return json({ ok: false, error: 'VALIDATION_FAILED', errors: { form: policy.ok ? 'اطلاعات واردشده معتبر نیست.' : policy.error } }, 422);
  }
  try {
    const result = await env.DB.prepare(`INSERT INTO users (email,password_hash,display_name,professional_title,position,membership_status)
      VALUES (?1,?2,?3,?4,?5,'approved') RETURNING id`)
      .bind(email, await hashPassword(password), displayName, title, position).first();
    const membershipNo = await allocateMembershipNo(env, result.id);
    await env.DB.prepare('UPDATE users SET membership_no=?1 WHERE id=?2').bind(membershipNo,result.id).run();
    await sendVerification(env,email);
    return json({ ok: true, id: result.id, membershipNo, verificationSent: true }, 201);
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) return json({ ok: false, error: 'EMAIL_ALREADY_EXISTS' }, 409);
    console.error(JSON.stringify({ where:'admin.members.manual', error:err?.name || 'Error' }));
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }
}
