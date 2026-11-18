// مدیریت درخواست‌های عضویت و ثبت دستی اعضا؛ فقط مدیران دارای نقش مرتبط.
import { json, readJsonBody } from './http.js';
import { currentUser } from './auth/routes.js';
import { hashPassword, validatePasswordPolicy } from './auth/password.js';
import { normalizeEmail, cleanText } from './validate.js';
import { sendMail } from './email/resend.js';

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

const POSITION_LABELS = Object.freeze({
  lawyer: 'وکیل محترم دادگستری',
  trainee: 'کارآموز محترم وکالت',
  law_student: 'دانشجوی محترم حقوق',
  law_graduate: 'فارغ‌التحصیل محترم رشته حقوق',
  professor: 'استاد محترم دانشگاه',
  researcher: 'پژوهشگر محترم حقوق',
  other: 'فعال محترم حوزه حقوق',
});

export function buildMembershipApprovalEmail({ displayName, gender, position, membershipNo, loginUrl }) {
  const name = cleanText(displayName) || 'عضو گرامی';
  const honorific = gender === 'male' ? 'جناب آقای' : gender === 'female' ? 'سرکار خانم' : '';
  const salutation = [honorific, name].filter(Boolean).join(' ');
  const positionLabel = POSITION_LABELS[position] || 'عضو ارجمند آکادمی';
  return [
    'با سلام و احترام،',
    '',
    `${salutation} عزیز،`,
    '',
    'با خرسندی به اطلاع می‌رسانیم درخواست عضویت شما پس از بررسی، مورد تأیید مدیر آکادمی قرار گرفته است.',
    'پیوستن شما به جمع اعضای آکادمی وکالت شهرام مختاری را صمیمانه تبریک می‌گوییم.',
    '',
    'از این پس می‌توانید از ظرفیت‌های آموزشی و علمی آکادمی برای توسعه دانش و مهارت‌های حرفه‌ای خود بهره‌مند شوید.',
    membershipNo ? `شماره عضویت شما: ${membershipNo}` : '',
    '',
    'برای ورود به حساب کاربری و استفاده از امکانات آکادمی از پیوند زیر استفاده کنید:',
    loginUrl,
    '',
    'امیدواریم حضور شما در این مجموعه، آغازگر تجربه‌ای ارزشمند از یادگیری، تعامل علمی و رشد حرفه‌ای باشد.',
    '',
    'با احترام و آرزوی موفقیت،',
    'آکادمی وکالت شهرام مختاری',
    'Mokhtari Law Academy',
    'mokhtari.ir',
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '')).join('\n');
}

async function sendMembershipApprovalEmail(env, user) {
  try {
    const mailer = env.mailer ?? ((args) => sendMail({ env, ...args }));
    const base = env.PUBLIC_BASE_URL || env.BASE_URL || 'https://mokhtari.ir';
    await mailer({
      to: user.email,
      subject: 'تبریک و خوش‌آمدگویی به عضویت شما | آکادمی وکالت شهرام مختاری',
      text: buildMembershipApprovalEmail({
        displayName: user.display_name,
        gender: user.gender,
        position: user.position,
        membershipNo: user.membership_no,
        loginUrl: `${base}/#/login`,
      }),
    });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ where: 'admin.members.approval_email', error: err?.name || 'Error', status: Number.isInteger(err?.status) ? err.status : undefined }));
    return false;
  }
}

export async function handleAdminMembership(request, env, path) {
  const allowed = ['/api/admin/members', '/api/admin/members/decision', '/api/admin/members/manual', '/api/admin/members/approval-email'];
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
    if (decision === 'approved' && user.membership_status === 'approved') {
      return json({ ok: true, membershipStatus: 'approved', alreadyApproved: true, emailSent: false });
    }
    await env.DB.prepare('UPDATE users SET membership_status=?1 WHERE id=?2').bind(decision,id).run();
    if (decision === 'rejected') {
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(id).run();
      return json({ ok: true, membershipStatus: decision });
    }
    const approvedUser = await env.DB.prepare(
      'SELECT email,display_name,gender,position,membership_no FROM users WHERE id=?1'
    ).bind(id).first();
    const emailSent = approvedUser ? await sendMembershipApprovalEmail(env, approvedUser) : false;
    return json({ ok: true, membershipStatus: decision, emailSent });
  }
  if (path === allowed[3]) {
    const id = Number(body.userId);
    if (!Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: 'VALIDATION_FAILED' }, 422);
    const user = await env.DB.prepare(
      "SELECT email,display_name,gender,position,membership_no FROM users WHERE id=?1 AND membership_status='approved'"
    ).bind(id).first();
    if (!user) return json({ ok: false, error: 'APPROVED_MEMBER_NOT_FOUND' }, 404);
    const emailSent = await sendMembershipApprovalEmail(env, user);
    return json({ ok: true, emailSent });
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
