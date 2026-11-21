import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { createTestDb } from './helpers/d1-sqlite.js';
import { hashToken } from '../worker/src/auth/token.js';
import { parseAmount, courtFeeReply, attorneyFeeReply } from '../worker/src/telegram/calc.js';
import { splitMessage, safeEqual, telegramConfigured, sendDocument } from '../worker/src/telegram/api.js';
import { tehranNow, shamsiLabel } from '../worker/src/telegram/dates.js';
import { sendDueReminders } from '../worker/src/telegram/reminders.js';
import { redeemLinkCode, createLinkCode, normalizeCode } from '../worker/src/telegram/link.js';

const SECRET = 'webhook-secret-0123456789';
const TOKEN = '123456789:AAFakeTokenForTestsOnly_0123456789';
const BASE = 'https://mokhtari.ir';

function mockFetch(handlers) {
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api.telegram.org/')) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (handlers?.gemini && u.includes('generativelanguage')) return handlers.gemini(u, init);
    throw new Error(`unexpected fetch ${u}`);
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

const geminiOk = (text) => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

function envWith(db, extra = {}) {
  return { DB: db, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET, ...extra };
}

function update(text, chatId = 555, type = 'private') {
  return { update_id: 1, message: { message_id: 1, chat: { id: chatId, type }, text } };
}

function post(env, body, secret = SECRET) {
  const headers = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret;
  return worker.fetch(new Request(`${BASE}/api/telegram/webhook`, { method: 'POST', headers, body: JSON.stringify(body) }), env);
}

function addUser(db, email = 'u@example.com') {
  return db.raw.prepare("INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?, 'h', 'کاربر', '2026-01-01T00:00:00Z') RETURNING id").get(email).id;
}

test('webhook: بدون هدر محرمانه یا با هدر نادرست رد می‌شود و چیزی ارسال نمی‌شود', async () => {
  const db = createTestDb();
  const net = mockFetch();
  try {
    const env = envWith(db);
    assert.equal((await post(env, update('/help'), null)).status, 403);
    assert.equal((await post(env, update('/help'), 'wrong-secret-0123456789')).status, 403);
    assert.equal(net.sent.length, 0);
  } finally { net.restore(); }
});

test('webhook: بدون تنظیم توکن/راز ۵۰۳ می‌دهد', async () => {
  const res = await post({ DB: createTestDb() }, update('/help'));
  assert.equal(res.status, 503);
  assert.equal(telegramConfigured({ TELEGRAM_BOT_TOKEN: TOKEN }), false);
});

test('webhook: /start راهنما را می‌فرستد و گروه‌ها نادیده گرفته می‌شوند', async () => {
  const db = createTestDb();
  const net = mockFetch();
  try {
    const env = envWith(db);
    assert.equal((await post(env, update('/start'))).status, 200);
    assert.equal(net.sent.length, 1);
    assert.equal(net.sent[0].chat_id, 555);
    assert.match(net.sent[0].text, /ربات وفاق/);
    await post(env, update('/start', 777, 'supergroup'));
    assert.equal(net.sent.length, 1, 'در گروه پاسخی داده نمی‌شود');
  } finally { net.restore(); }
});

test('webhook: پیام آزاد به Gemini می‌رود، پاورقی هشدار دارد و سقف روزانه اعمال می‌شود', async () => {
  const db = createTestDb();
  const net = mockFetch({ gemini: geminiOk('پاسخ نمونه') });
  try {
    const env = envWith(db, { GEMINI_API_KEY: 'AIzaSyTESTKEY-0123456789', TELEGRAM_AI_DAILY_LIMIT: '2' });
    await post(env, update('دادخواست چیست؟'));
    assert.match(net.sent[0].text, /پاسخ نمونه/);
    assert.match(net.sent[0].text, /مشاورهٔ حقوقی/);
    await post(env, update('سؤال دوم'));
    await post(env, update('سؤال سوم'));
    assert.match(net.sent[2].text, /سقف پرسش/);
    assert.equal(db.raw.prepare('SELECT ai_count FROM telegram_usage WHERE chat_id = 555').get().ai_count, 3);
  } finally { net.restore(); }
});

test('webhook: متن پیام کاربر در دیتابیس ذخیره نمی‌شود', async () => {
  const db = createTestDb();
  const net = mockFetch({ gemini: geminiOk('ok') });
  try {
    const env = envWith(db, { GEMINI_API_KEY: 'AIzaSyTESTKEY-0123456789' });
    await post(env, update('رازِ-بسیار-محرمانه'));
    const dump = JSON.stringify(db.raw.prepare('SELECT * FROM telegram_usage').all());
    assert.ok(!dump.includes('محرمانه'));
  } finally { net.restore(); }
});

test('parseAmount: واحد الزامی است و تومان به ریال تبدیل می‌شود', () => {
  assert.deepEqual(parseAmount('500 میلیون تومان'), { ok: true, rial: 5_000_000_000, unit: 'تومان' });
  assert.deepEqual(parseAmount('۵۰۰٬۰۰۰٬۰۰۰ ریال'), { ok: true, rial: 500_000_000, unit: 'ریال' });
  assert.equal(parseAmount('500000000').error, 'NO_UNIT');
  assert.equal(parseAmount('abc').error, 'NO_AMOUNT');
  assert.equal(parseAmount('9999999999999 میلیارد ریال').error, 'TOO_BIG');
});

test('هزینه دادرسی: بدوی ۲٫۵٪ تا ۲۰۰ میلیون و ۳٫۵٪ بر مازاد (ریال)', () => {
  // ۵۰۰ میلیون ریال: ۲۰۰م×۲٫۵٪ = ۵م + ۳۰۰م×۳٫۵٪ = ۱۰٫۵م ⇒ ۱۵٫۵ میلیون ریال
  const reply = courtFeeReply('500000000 ریال');
  assert.ok(reply.includes((15_500_000).toLocaleString('fa-IR')));
  assert.match(reply, /برآورد اولیه/);
  assert.match(courtFeeReply('500000000'), /واحد مبلغ/);
  assert.match(courtFeeReply('1000000000 ریال tajdid'), /تجدیدنظر/);
});

test('حق‌الوکاله: عدد از موتور سایت می‌آید و هشدار تمبر/سهم کانون دارد', () => {
  const reply = attorneyFeeReply('500 میلیون تومان');
  assert.match(reply, /حق‌الوکاله/);
  assert.match(reply, /تمبر مالیاتی/);
  assert.match(attorneyFeeReply('1000'), /واحد مبلغ/);
});

test('اتصال حساب: کد یک‌بارمصرف، فقط هش ذخیره می‌شود و ربات حساب را می‌شناسد', async () => {
  const db = createTestDb();
  const userId = addUser(db);
  const env = envWith(db);
  const made = await createLinkCode(env, userId);
  assert.equal(made.ok, true);
  assert.match(made.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM telegram_link_codes WHERE code_hash = ?').get(made.code).n, 0, 'خود کد ذخیره نشود');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM telegram_link_codes WHERE code_hash = ?').get(await hashToken(made.code)).n, 1);

  assert.equal((await redeemLinkCode(env, 555, 'WRONGCOD')).ok, false);
  assert.equal((await redeemLinkCode(env, 555, ` ${made.code.toLowerCase()} `)).ok, true);
  assert.equal((await redeemLinkCode(env, 556, made.code)).ok, false, 'کد دوباره قابل استفاده نیست');
  assert.equal(db.raw.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ?').get(userId).chat_id, 555);
  assert.equal(normalizeCode('ab-cd 12'), 'ABCD12');
});

test('اتصال حساب: کد منقضی رد می‌شود و سقف ساخت کد اعمال می‌شود', async () => {
  const db = createTestDb();
  const userId = addUser(db);
  const env = envWith(db);
  const old = await createLinkCode(env, userId, new Date(Date.now() - 20 * 60_000));
  assert.equal((await redeemLinkCode(env, 1, old.code)).ok, false);
  let last;
  for (let i = 0; i < 6; i += 1) last = await createLinkCode(env, userId);
  assert.equal(last.ok, false);
  assert.equal(last.error, 'TOO_MANY_CODES');
});

test('دستور /link و /deadlines و /unlink از طریق ربات', async () => {
  const db = createTestDb();
  const userId = addUser(db);
  const net = mockFetch();
  try {
    const env = envWith(db);
    await post(env, update('/deadlines'));
    assert.match(net.sent.at(-1).text, /\/link/, 'بدون اتصال، راهنمای اتصال نشان داده می‌شود');
    const { code } = await createLinkCode(env, userId);
    await post(env, update(`/link ${code}`));
    assert.match(net.sent.at(-1).text, /وصل شد/);
    const { date } = tehranNow();
    db.raw.prepare("INSERT INTO deadlines (user_id, title, due_date, kind) VALUES (?, 'جلسهٔ رسیدگی', ?, 'hearing')").run(userId, date);
    await post(env, update('/deadlines'));
    assert.match(net.sent.at(-1).text, /جلسهٔ رسیدگی/);
    await post(env, update('/unlink'));
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM telegram_links').get().n, 0);
  } finally { net.restore(); }
});

test('یادآوری: فقط موعدهای ۳ روز، ۱ روز و امروز؛ هر کدام یک بار؛ نه قبل از ساعت ۸ و نه برای انجام‌شده', async () => {
  const db = createTestDb();
  const userId = addUser(db);
  db.raw.prepare('INSERT INTO telegram_links (user_id, chat_id) VALUES (?, 900)').run(userId);
  const noon = new Date('2026-11-15T09:00:00Z'); // ۱۲:۳۰ تهران
  const { date: today } = tehranNow(noon);
  const plus = (n) => new Date(new Date(`${today}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const ins = db.raw.prepare('INSERT INTO deadlines (user_id, title, due_date, kind, done) VALUES (?, ?, ?, ?, ?)');
  ins.run(userId, 'سه روز', plus(3), 'hearing', 0);
  ins.run(userId, 'فردا', plus(1), 'appeal', 0);
  ins.run(userId, 'امروز', plus(0), 'filing', 0);
  ins.run(userId, 'دو روز', plus(2), 'other', 0);
  ins.run(userId, 'انجام‌شده', plus(1), 'other', 1);
  const net = mockFetch();
  try {
    const env = envWith(db);
    const early = await sendDueReminders(env, new Date('2026-11-15T02:00:00Z')); // ۰۵:۳۰ تهران
    assert.equal(early.sent, 0);
    const first = await sendDueReminders(env, noon);
    assert.equal(first.sent, 3);
    const texts = net.sent.map((m) => m.text).join('\n');
    assert.match(texts, /سه روز تا موعد/);
    assert.match(texts, /فردا موعد/);
    assert.match(texts, /امروز موعد/);
    assert.ok(!texts.includes('دو روز') && !texts.includes('انجام‌شده'));
    const again = await sendDueReminders(env, noon);
    assert.equal(again.sent, 0, 'ارسال تکراری نباید رخ دهد');
    assert.equal(net.sent.length, 3);
  } finally { net.restore(); }
});

test('یادآوری: اگر ارسال به تلگرام ناموفق باشد ثبت نمی‌شود و بعداً دوباره تلاش می‌شود', async () => {
  const db = createTestDb();
  const userId = addUser(db);
  db.raw.prepare('INSERT INTO telegram_links (user_id, chat_id) VALUES (?, 900)').run(userId);
  const now = new Date('2026-11-15T09:00:00Z');
  db.raw.prepare("INSERT INTO deadlines (user_id, title, due_date) VALUES (?, 'x1', ?)").run(userId, tehranNow(now).date);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  try {
    assert.equal((await sendDueReminders(envWith(db), now)).sent, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM telegram_reminders_sent').get().n, 0);
  } finally { globalThis.fetch = original; }
});

test('مسیرهای مدیریت اتصال بدون ورود ۴۰۱ می‌دهند', async () => {
  const env = envWith(createTestDb());
  for (const p of ['/api/telegram/link-code', '/api/telegram/status', '/api/telegram/unlink']) {
    const res = await worker.fetch(new Request(`${BASE}${p}`, { method: p.endsWith('status') ? 'GET' : 'POST' }), env);
    assert.equal(res.status, 401, p);
  }
});

test('ارسال فایل تلگرام: multipart، نام فایل امن و سقف حجم', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: init.body });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const env = envWith(createTestDb());
    assert.equal(await sendDocument(env, 555, {
      name: '../پرونده\nمحرمانه.pdf', type: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70, 45]),
    }, 'پیوست پرونده'), true);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /sendDocument$/);
    assert.equal(requests[0].body.get('chat_id'), '555');
    assert.equal(requests[0].body.get('caption'), 'پیوست پرونده');
    assert.equal(requests[0].body.get('document').name.includes('/'), false);
    assert.equal(await sendDocument(env, 555, { name: 'large.pdf', bytes: new Uint8Array(8 * 1024 * 1024 + 1) }), false);
    assert.equal(await sendDocument({ DB: env.DB }, 555, { name: 'x.pdf', bytes: new Uint8Array([1]) }), false);
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = original; }
});

test('ابزارهای کمکی: تقسیم پیام، مقایسهٔ امن، تاریخ تهران و شمسی', () => {
  assert.deepEqual(splitMessage('a'.repeat(10), 4).map((s) => s.length).every((n) => n <= 4), true);
  assert.equal(splitMessage('ab\ncd', 4).join('|'), 'ab|cd');
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(tehranNow(new Date('2026-11-14T21:00:00Z')).date, '2026-11-15'); // ۰۰:۳۰ تهران
  assert.equal(tehranNow(new Date('2026-11-15T04:30:00Z')).hour, 8);
  assert.equal(shamsiLabel('2026-11-15'), '۱۴۰۵/۰۸/۲۴');
});
