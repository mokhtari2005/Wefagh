// منطق ربات تلگرام: دستورها، برآورد هزینه، فهرست مواعد و پرسش هوش مصنوعی. متن پیام‌ها ذخیره نمی‌شود.
import { sendMessage } from './api.js';
import { courtFeeReply, attorneyFeeReply, UNOFFICIAL_NOTE } from './calc.js';
import { redeemLinkCode, linkedUserId, unlinkChat } from './link.js';
import { tehranNow, shamsiLabel, toFa } from './dates.js';
import { addDays } from '../../../site/js/calc/core.js';
import { AiError, aiConfigured, generateText } from '../ai/gemini.js';
import { telegramSystemPrompt } from '../ai/prompts.js';

const MAX_TEXT = 1500;
const DEFAULT_DAILY_AI = 20;
const KIND_LABEL = { hearing: 'جلسه', objection: 'اعتراض', appeal: 'تجدیدنظر', filing: 'تقدیم', other: 'سایر' };

const AI_FOOTER = '\n\nℹ️ این پاسخ اطلاعات عمومی است و مشاورهٔ حقوقی یا ایجاد رابطهٔ وکیل و موکل نیست.';

export const HELP_TEXT = [
  'به ربات وفاق خوش آمدید.',
  '',
  'پرسش حقوقی عمومی خود را بنویسید تا پاسخ اولیه بدهم. این پاسخ مشاوره نیست.',
  '',
  'دستورها:',
  '/dadresi مبلغ — برآورد هزینه دادرسی (مثال: /dadresi 500 میلیون تومان)',
  '/vakalat مبلغ — برآورد حق‌الوکاله (مثال: /vakalat 500 میلیون تومان)',
  '/deadlines — مواعد پیش‌رو (برای وکلای دارای حساب)',
  '/link کد — اتصال حساب سایت برای یادآوری مواعد',
  '/unlink — قطع اتصال',
  '/privacy — حریم خصوصی',
  '',
  'لطفاً کد ملی، شماره حساب یا اسناد شخصی در این گفتگو نفرستید.',
].join('\n');

const PRIVACY_TEXT = [
  'حریم خصوصی:',
  '• متن پیام‌های شما در دیتابیس ذخیره نمی‌شود.',
  '• برای پاسخ به پرسش‌ها، متن همان پیام به سرویس هوش مصنوعی گوگل (Gemini) فرستاده می‌شود؛ پس اطلاعات هویتی و محرمانه ننویسید.',
  '• برای یادآوری مواعد فقط شناسهٔ گفتگوی تلگرام شما ذخیره می‌شود و با /unlink پاک می‌شود.',
].join('\n');

async function aiUsageToday(env, chatId, day) {
  const row = await env.DB.prepare(
    'INSERT INTO telegram_usage (chat_id, day, ai_count) VALUES (?1, ?2, 1) ON CONFLICT(chat_id, day) DO UPDATE SET ai_count = ai_count + 1 RETURNING ai_count',
  ).bind(chatId, day).first();
  return row?.ai_count ?? 1;
}

async function askAi(env, chatId, text) {
  if (!aiConfigured(env)) return 'پاسخ هوشمند فعلاً فعال نیست. لطفاً بعداً دوباره تلاش کنید.';
  const limit = Number(env.TELEGRAM_AI_DAILY_LIMIT) > 0 ? Number(env.TELEGRAM_AI_DAILY_LIMIT) : DEFAULT_DAILY_AI;
  const used = await aiUsageToday(env, chatId, tehranNow().date);
  if (used > limit) return 'سقف پرسش‌های امروز شما تمام شد. فردا دوباره بپرسید یا برای گرفتن وقت مشاوره با وکیل تماس بگیرید.';
  try {
    const { text: answer } = await generateText(env, {
      system: telegramSystemPrompt(),
      contents: [{ role: 'user', parts: [{ text }] }],
      maxOutputTokens: 900,
    });
    return answer + AI_FOOTER;
  } catch (err) {
    if (err instanceof AiError && err.code === 'AI_QUOTA') return 'سرویس پاسخگویی فعلاً شلوغ است. چند دقیقه بعد دوباره امتحان کنید.';
    if (err instanceof AiError && err.code === 'AI_BLOCKED') return 'نمی‌توانم به این پیام پاسخ بدهم. لطفاً پرسش حقوقی خود را با عبارت دیگری بنویسید.';
    return 'پاسخگویی موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.';
  }
}

async function deadlinesReply(env, chatId) {
  const userId = await linkedUserId(env, chatId);
  if (!userId) {
    return 'این بخش برای وکلای دارای حساب است. در سایت از بخش مواعد یک کد اتصال بگیرید و بفرستید:\n/link کد';
  }
  const today = tehranNow().date;
  const rows = await env.DB.prepare(
    'SELECT title, case_no, due_date, due_time, kind FROM deadlines WHERE user_id = ?1 AND done = 0 AND due_date >= ?2 AND due_date <= ?3 ORDER BY due_date ASC, id ASC LIMIT 15',
  ).bind(userId, today, addDays(today, 30)).all();
  const list = rows?.results || [];
  if (!list.length) return 'در ۳۰ روز آینده موعد ثبت‌نشده‌ای ندارید.';
  const lines = list.map((r) => {
    const when = `${shamsiLabel(r.due_date)}${r.due_time ? ` ساعت ${toFa(r.due_time)}` : ''}`;
    return `• ${when} — ${KIND_LABEL[r.kind] || 'سایر'}: ${r.title}${r.case_no ? ` (پرونده ${toFa(r.case_no)})` : ''}`;
  });
  return ['مواعد پیش‌رو (۳۰ روز):', ...lines].join('\n');
}

// محدودکنندهٔ تلاش اتصال در حافظهٔ هر Worker: جلوگیری از حدس زدن کد.
const linkAttempts = new Map();
function linkRateLimited(chatId, now = Date.now()) {
  const recent = (linkAttempts.get(chatId) || []).filter((t) => t > now - 60_000);
  if (recent.length >= 5) { linkAttempts.set(chatId, recent); return true; }
  recent.push(now);
  linkAttempts.set(chatId, recent);
  return false;
}

async function runCommand(env, chatId, cmd, arg) {
  switch (cmd) {
    case 'start':
    case 'help':
      return HELP_TEXT;
    case 'privacy':
      return PRIVACY_TEXT;
    case 'dadresi':
      return courtFeeReply(arg);
    case 'vakalat':
      return attorneyFeeReply(arg);
    case 'deadlines':
      return deadlinesReply(env, chatId);
    case 'link': {
      if (linkRateLimited(chatId)) return 'تلاش‌های زیاد. یک دقیقه بعد دوباره امتحان کنید.';
      const r = await redeemLinkCode(env, chatId, arg);
      return r.ok
        ? 'حساب شما وصل شد. از این پس یادآوری مواعد (سه روز قبل، یک روز قبل و روز موعد، ساعت ۸ صبح) در همین گفتگو می‌آید.\nبرای قطع اتصال: /unlink'
        : 'کد نامعتبر یا منقضی است. از بخش مواعد سایت کد تازه بگیرید (۱۰ دقیقه اعتبار دارد).';
    }
    case 'unlink':
      await unlinkChat(env, chatId);
      return 'اتصال قطع شد و دیگر یادآوری نمی‌فرستم.';
    default:
      return 'دستور ناشناخته است. برای فهرست دستورها /help را بفرستید.';
  }
}

/** یک به‌روزرسانی تلگرام را پردازش می‌کند. هرگز خطا پرتاب نمی‌کند تا تلگرام درخواست را تکرار نکند. */
export async function processUpdate(env, update) {
  try {
    const msg = update?.message;
    if (!msg || msg.chat?.type !== 'private' || !Number.isSafeInteger(msg.chat?.id)) return;
    const chatId = msg.chat.id;
    if (typeof msg.text !== 'string' || !msg.text.trim()) {
      await sendMessage(env, chatId, 'فعلاً فقط پیام متنی را می‌فهمم. پرسش خود را بنویسید.');
      return;
    }
    const text = msg.text.trim().slice(0, MAX_TEXT);
    const m = text.match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
    const reply = m ? await runCommand(env, chatId, m[1].toLowerCase(), (m[2] || '').trim()) : await askAi(env, chatId, text);
    await sendMessage(env, chatId, reply);
  } catch (err) {
    console.error(JSON.stringify({ where: 'telegram.update', error: err?.name || 'Error' }));
  }
}

export { UNOFFICIAL_NOTE };
