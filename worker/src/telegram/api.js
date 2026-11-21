// فراخوانی Bot API تلگرام. توکن فقط از Secret ورکر (TELEGRAM_BOT_TOKEN) خوانده می‌شود و هرگز لاگ یا بازگردانده نمی‌شود.

const TELEGRAM_API = 'https://api.telegram.org';
export const MAX_MESSAGE_CHARS = 4000; // سقف تلگرام ۴۰۹۶ است.

export function telegramConfigured(env) {
  return typeof env?.TELEGRAM_BOT_TOKEN === 'string'
    && env.TELEGRAM_BOT_TOKEN.trim().length >= 20
    && typeof env?.TELEGRAM_WEBHOOK_SECRET === 'string'
    && env.TELEGRAM_WEBHOOK_SECRET.trim().length >= 16;
}

/** متن بلند را روی مرز خط به چند پیام تقسیم می‌کند. */
export function splitMessage(text, max = MAX_MESSAGE_CHARS) {
  const out = [];
  let rest = String(text ?? '');
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.trim()) out.push(rest);
  return out;
}

/** ارسال متن ساده (بدون parse_mode تا نویسه‌های ویژه خطا ندهند). خطا پرتاب نمی‌شود؛ نتیجه true/false است. */
export async function sendMessage(env, chatId, text) {
  let allOk = true;
  for (const part of splitMessage(text)) {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN.trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: part, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        allOk = false;
        console.error(JSON.stringify({ where: 'telegram.send', httpStatus: res.status }));
      }
    } catch (err) {
      allOk = false;
      console.error(JSON.stringify({ where: 'telegram.send', error: err?.name || 'Error' }));
    }
  }
  return allOk;
}

/** ارسال فایل پیوست فقط پس از درخواست صریح کاربر؛ توکن در لاگ یا خروجی قرار نمی‌گیرد. */
export async function sendDocument(env, chatId, file, caption = '') {
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', String(caption).slice(0, 900));
    form.append('document', new Blob([file.bytes], { type: file.type || 'application/octet-stream' }), file.name || 'attachment');
    const res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN.trim()}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ where: 'telegram.send_document', httpStatus: res.status }));
      return false;
    }
    return true;
  } catch (err) {
    console.error(JSON.stringify({ where: 'telegram.send_document', error: err?.name || 'Error' }));
    return false;
  }
}

/** مقایسهٔ زمان‌ثابت دو رشته (برای هدر محرمانهٔ webhook). */
export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a ?? ''));
  const y = new TextEncoder().encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
