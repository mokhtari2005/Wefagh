// اعلان ثبت درخواست عضویت برای مدیران آکادمی؛ شکست اعلان نباید ثبت‌نام را مختل کند.
import { sendWebPush } from './webpush.js';
import { sendMail } from '../email/resend.js';

export async function notifyMembershipAdmins(env, applicant = {}) {
  if (!env?.DB) return { pushSent: 0, emailSent: false };
  let pushSent = 0;
  try {
    if (env.VAPID_PRIVATE_JWK && env.VAPID_PUBLIC_KEY) {
      const rows = await env.DB.prepare(`
        SELECT DISTINCT s.id, s.user_id, s.endpoint, s.p256dh, s.auth
        FROM push_subscriptions s
        JOIN user_roles r ON r.user_id = s.user_id
        WHERE r.role IN ('admin', 'super_admin', 'membership_manager', 'academy_manager')
      `).all();
      for (const sub of rows?.results || []) {
        try {
          const result = await sendWebPush(env, sub, {
            title: 'درخواست عضویت جدید در آکادمی',
            body: (applicant.displayName || 'متقاضی جدید') + ' درخواست عضویت ثبت کرده است. برای بررسی و تأیید یا رد وارد پنل شوید.',
            url: '/#/admin',
          });
          if (result.stale) {
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(sub.endpoint).run();
          } else if (result.ok) pushSent++;
        } catch (err) {
          console.error(JSON.stringify({ where: 'push.membership', error: err?.name || 'Error' }));
        }
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ where: 'push.membership.lookup', error: err?.name || 'Error' }));
  }

  let emailSent = false;
  const adminEmail = String(env.ADMIN_EMAIL || '').trim();
  if (adminEmail) {
    try {
      const mailer = env.mailer ?? ((args) => sendMail({ env, ...args }));
      await mailer({
        to: adminEmail,
        subject: 'درخواست عضویت جدید | آکادمی وکالت شهرام مختاری',
        text: [
          'یک درخواست عضویت جدید در آکادمی ثبت شده است.',
          '',
          'نام متقاضی: ' + (applicant.displayName || '—'),
          'ایمیل: ' + (applicant.email || '—'),
          'سمت: ' + (applicant.position || '—'),
          '',
          'برای بررسی و تأیید یا رد درخواست وارد پنل مدیریت شوید:',
          (env.PUBLIC_BASE_URL || env.BASE_URL || 'https://mokhtari.ir') + '/#/admin',
        ].join('\n'),
      });
      emailSent = true;
    } catch (err) {
      console.error(JSON.stringify({ where: 'email.membership_admin', error: err?.name || 'Error' }));
    }
  }
  return { pushSent, emailSent };
}
