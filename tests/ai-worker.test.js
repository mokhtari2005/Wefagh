import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { AiError, extractText, generateText, synthesizeSpeech, aiConfigured, modelIds } from '../worker/src/ai/gemini.js';
import { cleanHistory, rateLimited, LIMITS, transcriptText, SPEAKERS, VOICES, guardUnverifiedLegalClaims } from '../worker/src/ai/routes.js';
import { mootSystemPrompt, mootEvaluationPrompt, assistantSystemPrompt, LEGAL_DISCLAIMER } from '../worker/src/ai/prompts.js';
import { groqConfigured, reviewLegalDraft, groqReviewNotes, GROQ_API, GROQ_REVIEW_MODEL } from '../worker/src/ai/groq.js';
import batch01 from '../worker/src/moot/bank/batch-01.js';

// پروندهٔ نمونه از بانک (پیش‌نویس)؛ فقط برای آزمون ساخت دستور سیستمی از داده‌های پرونده.
const SAMPLE_CASE = batch01[0];
const SAMPLE_ROW = { slug: SAMPLE_CASE.id, title: SAMPLE_CASE.title, summary: SAMPLE_CASE.subject.padEnd(12, '.').slice(0, 300), payload_json: JSON.stringify(SAMPLE_CASE) };

const KEY = 'AIzaSyTESTKEY-0123456789';
const BASE = 'https://mokhtari.ir';

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return impl(String(url), init);
  };
  return fn(calls).finally(() => { globalThis.fetch = original; });
}

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// D1 ساختگی: نشست معتبر یا بدون نشست.
function fakeDb({ loggedIn = false, caseRow = null } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => (sql.includes('FROM admin_content') ? caseRow : sql.includes('FROM sessions') && loggedIn ? { id: 7, email: 'u@example.com', display_name: 'کاربر' } : null),
            all: async () => ({ results: loggedIn ? [{ role: 'user' }] : [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
}

function req(path, { method = 'POST', body, cookie = null, type = 'application/json' } = {}) {
  const headers = {};
  if (type) headers['content-type'] = type;
  if (cookie) headers.cookie = `wefagh_session=${cookie}`;
  return new Request(BASE + path, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
}

test('کلید API فقط از Secret خوانده می‌شود و وضعیت آن هرگز کلید را نشان نمی‌دهد', async () => {
  assert.equal(aiConfigured({}), false);
  assert.equal(aiConfigured({ GEMINI_API_KEY: 'short' }), false);
  assert.equal(aiConfigured({ GEMINI_API_KEY: KEY }), true);
  const res = await worker.fetch(req('/api/ai/status', { method: 'GET' }), { GEMINI_API_KEY: KEY });
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(text.includes('"configured":true'));
  assert.ok(!text.includes(KEY));
});

test('بدون کلید هیچ درخواستی به Gemini ارسال نمی‌شود', async () => {
  await withFetch(async () => { throw new Error('نباید فراخوانی شود'); }, async (calls) => {
    await assert.rejects(() => generateText({}, { system: 's', contents: [] }), (e) => e instanceof AiError && e.code === 'AI_NOT_CONFIGURED' && e.status === 503);
    assert.equal(calls.length, 0);
  });
});

test('کلید در هدر می‌رود، نه در آدرس، و در پیام خطا نمی‌آید', async () => {
  await withFetch(async () => jsonRes(403, { error: { message: `key ${KEY} denied` } }), async (calls) => {
    const env = { GEMINI_API_KEY: KEY };
    await assert.rejects(() => generateText(env, { system: 's', contents: [{ role: 'user', parts: [{ text: 'سلام' }] }] }), (e) => {
      assert.equal(e.code, 'AI_KEY_REJECTED');
      assert.ok(!String(e.message).includes(KEY));
      return true;
    });
    assert.ok(!calls[0].url.includes(KEY));
    assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
    assert.ok(calls[0].url.includes(`models/${modelIds(env).text}:generateContent`));
  });
});

test('خطاهای API به کدهای امن و وضعیت مناسب نگاشت می‌شوند', async () => {
  const cases = [[429, 'AI_QUOTA', 429], [500, 'AI_PROVIDER_ERROR', 503], [400, 'AI_REJECTED', 502]];
  for (const [upstream, code, status] of cases) {
    await withFetch(async () => jsonRes(upstream, {}), async () => {
      await assert.rejects(() => generateText({ GEMINI_API_KEY: KEY }, { system: 's', contents: [] }), (e) => e.code === code && e.status === status);
    });
  }
  await withFetch(async () => { throw new TypeError('network down'); }, async () => {
    await assert.rejects(() => generateText({ GEMINI_API_KEY: KEY }, { system: 's', contents: [] }), (e) => e.code === 'AI_NETWORK_ERROR');
  });
});

test('متن خالی یا بلاک‌شده خطای مشخص می‌دهد', () => {
  assert.equal(extractText({ candidates: [{ content: { parts: [{ text: ' سلام ' }] } }] }), 'سلام');
  assert.throws(() => extractText({ candidates: [] }), (e) => e.code === 'AI_EMPTY');
  assert.throws(() => extractText({ promptFeedback: { blockReason: 'SAFETY' } }), (e) => e.code === 'AI_BLOCKED');
});

test('صدا از پاسخ Interactions استخراج و به بایت تبدیل می‌شود', async () => {
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6]).toString('base64');
  const body = { steps: [{ type: 'model_output', content: [{ type: 'audio', data: pcm }] }] };
  await withFetch(async () => jsonRes(200, body), async (calls) => {
    const out = await synthesizeSpeech({ GEMINI_API_KEY: KEY }, 'متن آزمایشی');
    assert.deepEqual([...out.bytes], [1, 2, 3, 4, 5, 6]);
    assert.equal(out.mimeType, 'audio/wav');
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.response_format.type, 'audio');
  });
});

test('سابقهٔ گفت‌وگو: نقش نامعتبر و سقف تعداد و طول رد می‌شود', () => {
  assert.equal(cleanHistory(undefined).length, 0);
  assert.equal(cleanHistory([{ role: 'system', text: 'x' }]), null);
  assert.equal(cleanHistory(Array.from({ length: LIMITS.historyItems + 1 }, () => ({ role: 'user', text: 'ا' }))), null);
  assert.equal(cleanHistory([{ role: 'user', text: 'a'.repeat(LIMITS.turnChars + 1) }]), null);
  assert.equal(cleanHistory([{ role: 'ai', text: 'پاسخ' }]).length, 1);
});

test('محدودکنندهٔ نرخ هر کاربر بعد از سقف درخواست را می‌بندد', () => {
  const id = 'rate-test-' + Math.random();
  const now = 1_000_000;
  for (let i = 0; i < LIMITS.callsPerMinute; i++) assert.equal(rateLimited(id, now), false);
  assert.equal(rateLimited(id, now), true);
  assert.equal(rateLimited(id, now + 61_000), false);
});

test('مسیرهای هوش مصنوعی بدون ورود رد می‌شوند', async () => {
  for (const path of ['/api/ai/moot/turn', '/api/ai/assistant', '/api/ai/speech', '/api/ai/transcribe']) {
    const res = await worker.fetch(req(path, { body: { caseId: SAMPLE_CASE.id } }), { DB: fakeDb(), GEMINI_API_KEY: KEY });
    assert.equal(res.status, 401, path);
  }
});

test('ورودی نامعتبر پس از ورود با ۴۲۲ رد می‌شود و بدون فراخوانی Gemini', async () => {
  await withFetch(async () => { throw new Error('نباید فراخوانی شود'); }, async (calls) => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const cookie = 'tok';
    const bad = await worker.fetch(req('/api/ai/moot/turn', { body: { caseId: 'Bad ID!', role: 'judge', history: [] }, cookie }), env);
    assert.equal(bad.status, 422);
    const noDoc = await worker.fetch(req('/api/ai/assistant', { body: { mode: 'draft', message: 'سلام', history: [] }, cookie }), env);
    assert.equal(noDoc.status, 422);
    const badMime = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'application/x-msdownload', data: 'AAAA' }, cookie }), env);
    assert.equal(badMime.status, 422);
    const tooBig = await worker.fetch(req('/api/ai/speech', { body: { text: 'ا'.repeat(LIMITS.speechChars + 1) }, cookie }), env);
    assert.equal(tooBig.status, 422);
    assert.equal(calls.length, 0);
  });
});

test('پرونده و دستور سیستمی روی سرور است و پیام کاربر نمی‌تواند نقش را عوض کند', () => {
  const prompt = mootSystemPrompt({ role: 'defendant', caseData: SAMPLE_CASE, difficulty: 'advanced', stage: 'defense' });
  assert.ok(prompt.includes('وکیل خوانده'));
  assert.ok(prompt.includes('دفاع: خوانده'));
  assert.ok(prompt.includes(SAMPLE_CASE.subject));
  assert.ok(prompt.includes(SAMPLE_CASE.facts[0]));
  // وکیل خوانده پرسش‌های قاضی و رأی آموزشی را نمی‌بیند.
  assert.ok(!prompt.includes(SAMPLE_CASE.judge_questions[0]));
  assert.ok(!prompt.includes(SAMPLE_CASE.verdict.outcome));
  const judge = mootSystemPrompt({ role: 'judge', caseData: SAMPLE_CASE, difficulty: 'medium', stage: 'claim' });
  assert.ok(judge.includes(SAMPLE_CASE.judge_questions[0]));
  assert.ok(!judge.includes(SAMPLE_CASE.verdict.outcome));
  assert.ok(!mootEvaluationPrompt(SAMPLE_CASE).includes('undefined'));
  assert.ok(prompt.includes('نادیده بگیر'));
  const asst = assistantSystemPrompt({ mode: 'draft', docType: 'petition' });
  assert.ok(asst.includes('دادخواست'));
  assert.ok(asst.includes('[جای خالی'));
  assert.ok(LEGAL_DISCLAIMER.includes('جایگزین بررسی حرفه‌ای وکیل نیست'));
});

test('کنترل سمت سرور، شماره ماده و مهلت فاقد پشتوانه را پیش از نمایش خنثی می‌کند', () => {
  const guarded = guardUnverifiedLegalClaims(
    'طبق ماده ۱۷۹ و ماده ۱۸۳ باید ظرف ۳۰ روز اقدام کنید؛ همچنین ماده ۴۲۲ قابل اعمال است.',
    [{ articleNumber: '۴۲۲' }],
    'ماده ۴۲۲ قانون مدنی؛ منبع درباره مهلت زمانی حکمی ندارد.',
  );
  assert.match(guarded.text, /شماره نیازمند تطبیق با متن رسمی/);
  assert.match(guarded.text, /مدت نیازمند تطبیق با منبع رسمی/);
  assert.match(guarded.text, /ماده ۴۲۲/);
  assert.equal(guarded.changed, true);
  const safe = guardUnverifiedLegalClaims('ماده ۴۲۲ فوری است.', [{ articleNumber: '۴۲۲' }], 'ماده ۴۲۲');
  assert.equal(safe.text, 'ماده ۴۲۲ فوری است.');
  assert.equal(safe.changed, false);
});

test('مسیر دستیار از ورود تا پاسخ ساخت‌یافته (با Gemini ساختگی) کامل کار می‌کند', async () => {
  const modelJson = { status: 'ready', questions: [], text: 'پیش‌نویس آزمایشی [جای خالی: نام موکل]', notes: ['بررسی شود'] };
  await withFetch(async (url, init) => {
    assert.ok(url.includes('generativelanguage.googleapis.com'));
    assert.ok(!url.includes(KEY));
    const sent = JSON.parse(init.body);
    assert.equal(sent.generationConfig.responseMimeType, 'application/json');
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
  }, async () => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', { body: { mode: 'draft', docType: 'petition', message: 'موضوع: مطالبه خسارت', history: [] }, cookie: 'tok' }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.status, 'ready');
    assert.match(data.text, /جای خالی/);
    assert.equal(data.disclaimer, LEGAL_DISCLAIMER);
    assert.ok(!JSON.stringify(data).includes(KEY));
  });
});

test('میز محاکمه هوشمند: حالت مستقل، پرامپت چندمنظری و بازبینی یکپارچه', async () => {
  const modelJson = {
    status: 'ready', questions: [],
    text: 'واقعیت‌های مستند باید از ادعاهای طرفین تفکیک شوند. قوی‌ترین دفاع طرف مقابل، پاسخ موکل و ارزیابی بی‌طرفانه قاضی در این گزارش بررسی می‌شود.',
    notes: [],
  };
  const systems = [];
  await withFetch(async (url, init) => {
    systems.push(JSON.parse(init.body).systemInstruction.parts[0].text);
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
  }, async (calls) => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', {
      body: { mode: 'litigation', docType: 'retrial', message: 'این پرونده را از دیدگاه طرف مقابل، وکیل موکل و قاضی بررسی کن.', history: [] },
      cookie: 'tok',
    }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(calls.length, 3);
    assert.ok(systems.every((system) => system.includes('میز محاکمه هوشمند')));
    assert.ok(systems.some((system) => system.includes('قوی‌ترین دفاع‌ها، ایرادهای شکلی و ماهوی')));
    assert.ok(systems.some((system) => system.includes('نقش تو وکیل موکل/کاربر است')));
    assert.ok(systems.some((system) => system.includes('قاضی بی‌طرف و ارزیاب')));
    assert.ok(systems.every((system) => system.includes('ماده ۴۲۶')));
    assert.ok(systems.every((system) => system.includes('تأییدنشده')));
    assert.match(data.text, /واقعیت‌های مستند/);
    assert.ok(data.notes.some((note) => note.includes('بازبینی مستقل')));
  });
});

test('تحقیق و راستی‌آزمایی حقوقی: حالت مستقل و دستور کنترل انطباق استناد', async () => {
  const modelJson = {
    status: 'ready', questions: [],
    text: 'نتیجه تحقیق: ماده قانونی باید هم از حیث متن معتبر و هم از حیث ارتباط با گزاره مورد استناد بررسی شود.',
    notes: ['منبع رسمی برای تطبیق نهایی لازم است.'],
  };
  let system = '';
  await withFetch(async (url, init) => {
    system = JSON.parse(init.body).systemInstruction.parts[0].text;
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
  }, async () => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', {
      body: { mode: 'research', docType: 'other', message: 'مبنای قانونی این ادعا را بررسی کن.', history: [] },
      cookie: 'tok',
    }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.match(system, /پژوهشگر حقوقی/);
    assert.match(system, /میزان انطباق/);
    assert.match(system, /ادعای جست‌وجوی برخط/);
    assert.match(data.text, /نتیجه تحقیق/);
  });
});

test('نقش‌های دادگاه فقط سه نقش معتبر دارند و مرحلهٔ ناشناخته رد می‌شود', async () => {
  await withFetch(async () => { throw new Error('نباید فراخوانی شود'); }, async () => {
    const env = { DB: fakeDb({ loggedIn: true, caseRow: SAMPLE_ROW }), GEMINI_API_KEY: KEY };
    const opposing = await worker.fetch(req('/api/ai/moot/turn', { body: { caseId: SAMPLE_CASE.id, role: 'opposing', history: [] }, cookie: 'tok' }), env);
    assert.equal(opposing.status, 422);
    const badStage = await worker.fetch(req('/api/ai/moot/turn', { body: { caseId: SAMPLE_CASE.id, role: 'judge', stage: 'hack', history: [] }, cookie: 'tok' }), env);
    assert.equal(badStage.status, 422);
  });
});

test('متن گفت‌وگو هر گوینده را با برچسب فارسی و بدون دستور نشان می‌دهد', () => {
  const text = transcriptText([
    { role: 'ai', speaker: 'judge', text: 'سؤال' },
    { role: 'user', speaker: 'plaintiff', text: 'پاسخ' },
  ]);
  assert.equal(text, '[قاضی]: سؤال\n[وکیل خواهان]: پاسخ');
  assert.equal(transcriptText([]), '(هنوز گفت‌وگویی انجام نشده است.)');
  assert.equal(SPEAKERS.defendant, 'وکیل خوانده');
});

test('صدای بازیگران فقط از فهرست مجاز انتخاب می‌شود', () => {
  assert.ok(VOICES.includes('Kore'));
  assert.ok(!VOICES.includes('<script>'));
});

test('سابقهٔ گفت‌وگوی جلسهٔ کامل (تا ۴۰ مورد) پذیرفته می‌شود', () => {
  const full = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'user' : 'ai', speaker: 'judge', text: `جمله ${i}` }));
  assert.equal(cleanHistory(full).length, 30);
});

test('حالت مشاورهٔ حقوقی بدون نوع سند پاسخ می‌دهد و دستور مشاوره به مدل می‌رسد', async () => {
  const modelJson = { status: 'ready', questions: [], text: 'مهلت تجدیدنظرخواهی معمولاً بیست روز است.', notes: [] };
  let system = '';
  await withFetch(async (url, init) => {
    system = JSON.parse(init.body).systemInstruction.parts[0].text;
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
  }, async () => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', { body: { mode: 'consult', message: 'مهلت تجدیدنظرخواهی چقدر است؟', history: [] }, cookie: 'tok' }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, 'ready');
    assert.match(data.text, /مهلت/);
    assert.ok(system.includes('پاسخ مشاوره‌ای'));
    assert.ok(!system.includes('تهیه کن'));
  });
});

test('مشاوره درباره تصادف پنهان خودرو، مواد مدنی مرتبط را فراهم و استناد و مهلت ساختگی را حذف می‌کند', async () => {
  const modelJson = {
    status: 'ready', questions: [],
    text: 'طبق ماده ۱۷۹ خریدار ظرف ۳۰ روز باید اقدام کند. ماده ۴۲۲ حق فسخ یا ارش را مقرر کرده است.',
    notes: [],
  };
  let system = '';
  await withFetch(async (url, init) => {
    system = JSON.parse(init.body).systemInstruction.parts[0].text;
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
  }, async () => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', {
      body: { mode: 'consult', message: 'بعد از خرید خودرو متوجه تصادف پنهان پیش از فروش شده‌ام؛ چه کنم؟', history: [] },
      cookie: 'tok',
    }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.match(system, /ماده ۴۲۲/);
    assert.match(system, /ماده ۴۳۵/);
    assert.match(data.text, /شماره نیازمند تطبیق با متن رسمی/);
    assert.match(data.text, /مدت نیازمند تطبیق با منبع رسمی/);
    assert.match(data.text, /ماده ۴۲۲ حق فسخ یا ارش/);
    assert.ok(data.notes.some((note) => note.includes('فاقد پشتوانه')));
  });
});

test('تاریخچهٔ دستیار: پیام بلند کوتاه و پیام خالی حذف می‌شود، نه اینکه درخواست رد شود', async () => {
  const { lenientHistory } = await import('../worker/src/ai/routes.js');
  const out = lenientHistory([
    { role: 'user', text: 'سلام' },
    { role: 'ai', text: 'پ'.repeat(5000) },
    { role: 'ai', text: '   ' },
    { role: 'x', text: 'نامعتبر' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].text.length, 4000);
  assert.equal(lenientHistory(undefined).length, 0);
  assert.equal(lenientHistory('bad'), null);
});


test('Groq بازبین مستقل فقط با Secret فعال می‌شود و کلید را افشا نمی‌کند', () => {
  assert.equal(groqConfigured({}), false);
  assert.equal(groqConfigured({ GROQ_API_KEY: 'short' }), false);
  assert.equal(groqConfigured({ GROQ_API_KEY: 'groq-test-key-0123456789' }), true);
  assert.match(GROQ_API, /api\.groq\.com/);
  assert.equal(GROQ_REVIEW_MODEL, 'openai/gpt-oss-120b');
  assert.match(groqReviewNotes({ status: 'quota_exceeded' })[0], /سهمیه رایگان/);
  assert.match(groqReviewNotes({ status: 'not_configured' })[0], /GROQ_API_KEY/);
});

test('بازبین میز محاکمه نقش‌های طرف مقابل، وکیل موکل و قاضی را جداگانه بررسی می‌کند', async () => {
  const groqKey = 'groq-test-key-0123456789';
  const reviewJson = {
    risk: 'medium',
    summary: 'دو ایراد مهم و یک خلأ اثباتی باقی است.',
    issues: [
      { severity: 'high', category: 'وکیل طرف مقابل', observation: 'دلیل کافی برای اثبات انجام تعهد ارائه نشده است.', recommendation: 'مدارک انجام تعهد و مکاتبات را ضمیمه کنید.' },
      { severity: 'medium', category: 'وکیل موکل', observation: 'پاسخ به ایراد طرف مقابل باید به سند مشخص متصل شود.', recommendation: 'پاسخ را با ارجاع به مستند موجود تکمیل کنید.' },
      { severity: 'high', category: 'قاضی بی‌طرف', observation: 'زمان دقیق ابلاغ و آغاز مهلت روشن نیست.', recommendation: 'گواهی ابلاغ و تاریخ اطلاع را احراز کنید.' },
    ],
    citations: [],
  };
  await withFetch(async (url, init) => {
    assert.equal(url, GROQ_API);
    const sent = JSON.parse(init.body);
    assert.match(sent.messages[0].content, /وکیل طرف مقابل/);
    assert.match(sent.messages[0].content, /وکیل موکل/);
    assert.match(sent.messages[0].content, /قاضی بی‌طرف/);
    assert.match(sent.messages[0].content, /راستی‌آزمایی استنادات/);
    assert.match(sent.messages[0].content, /کنترل خواسته‌ها/);
    assert.match(sent.messages[0].content, /نقل‌قول ترکیبی/);
    return jsonRes(200, { choices: [{ message: { content: JSON.stringify(reviewJson) } }] });
  }, async () => {
    const result = await reviewLegalDraft({ GROQ_API_KEY: groqKey }, {
      mode: 'litigation', docType: 'retrial',
      question: 'اعتراض به رأی قطعی را بررسی کن.',
      draft: 'متن پیش‌نویس برای بررسی مستقل.',
    });
    assert.equal(result.status, 'reviewed');
    assert.deepEqual(result.review.issues.map((item) => item.category), ['وکیل طرف مقابل', 'وکیل موکل', 'قاضی بی‌طرف']);
  });
});

test('Groq پیش‌نویس را مستقل بررسی می‌کند و خروجی را فقط به‌صورت هشدار نمایش می‌دهد', async () => {
  const groqKey = 'groq-test-key-0123456789';
  const geminiJson = { status: 'ready', questions: [], text: 'پیش‌نویس لایحه با استناد به ماده ۱۲۳', notes: [] };
  const reviewJson = { risk: 'high', summary: 'صلاحیت مرجع باید بررسی شود.', issues: [{ severity: 'high', category: 'صلاحیت', observation: 'مرجع صالح در متن روشن نیست.', recommendation: 'مرجع رسیدگی و مبنای صلاحیت را مشخص کنید.' }], citations: [{ citation: 'ماده ۱۲۳', concern: 'وضعیت اعتبار و انطباق آن با موضوع باید از منبع رسمی بررسی شود.' }] };
  await withFetch(async (url, init) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(geminiJson) }] } }] });
    }
    assert.equal(url, GROQ_API);
    assert.equal(init.headers.authorization, `Bearer ${groqKey}`);
    const sent = JSON.parse(init.body);
    assert.equal(sent.model, GROQ_REVIEW_MODEL);
    assert.equal(sent.response_format.type, 'json_object');
    assert.ok(sent.messages[1].content.includes(geminiJson.text));
    return jsonRes(200, { choices: [{ message: { content: JSON.stringify(reviewJson) } }] });
  }, async (calls) => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY, GROQ_API_KEY: groqKey };
    const res = await worker.fetch(req('/api/ai/assistant', { body: { mode: 'draft', docType: 'defense', message: 'برای خوانده لایحه دفاعیه تنظیم کن.', history: [] }, cookie: 'tok' }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.outputs, undefined, 'reviewer output must not be returned as a second assistant answer');
    assert.ok(data.notes.includes('بازبینی ماشینی مستقل انجام شد.'));
    assert.ok(!data.notes.some((note) => note.includes('مرجع صالح در متن روشن نیست')));
    assert.equal(data.reviewDetails, undefined, 'private reviewer diagnostics must not be returned to the user');
    assert.equal(calls.length, 2);
    assert.ok(!JSON.stringify(data).includes(groqKey));
  });
});

test('بدون Secret کلید Groq، بازبینی مستقل فعال نمی‌شود', async () => {
  const result = await reviewLegalDraft({}, { mode: 'draft', docType: 'petition', question: 'سؤال', draft: 'پیش‌نویس' });
  assert.equal(result.status, 'not_configured');
  assert.match(groqReviewNotes({ status: 'not_configured' })[0], /فعال نشده است/);
});

test('تشخیص Groq: وضعیت کلید بدون افشا و بررسی رایگان فهرست مدل‌ها', async () => {
  const { groqKeyState, probeGroq, groqProbeHint } = await import('../worker/src/ai/groq.js');
  assert.equal(groqKeyState({}), 'missing');
  assert.equal(groqKeyState({ GROQ_API_KEY: 'gsk_short' }), 'too_short');
  assert.match(groqProbeHint(await probeGroq({})), /در زمان اجرا/);
  assert.match(groqReviewNotes({ status: 'not_configured', keyState: 'missing' })[0], /در زمان اجرا/);
  const key = 'gsk_test_key_0123456789abcdef';
  await withFetch(async (url, init) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/models');
    assert.equal(init.headers.authorization, `Bearer ${key}`);
    return jsonRes(200, { data: [{ id: 'openai/gpt-oss-120b' }] });
  }, async () => {
    const r = await probeGroq({ GROQ_API_KEY: key });
    assert.equal(r.ok, true);
    assert.deepEqual(r.models.map((m) => m.available), [true, false]);
    assert.ok(!JSON.stringify(r).includes(key));
  });
});

test('تایپ صوتی: صدا با زبان انتخاب‌شده به Gemini می‌رود و متن برمی‌گردد؛ کلید افشا نمی‌شود', async () => {
  const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
  await withFetch(async () => jsonRes(200, { candidates: [{ content: { parts: [{ text: 'hello world' }] }, finishReason: 'STOP' }] }), async (calls) => {
    const res = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'audio/mp4', data: 'AAAA', language: 'en' }, cookie: 'tok' }), env);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(text).text, 'hello world');
    assert.ok(!text.includes(KEY));
    const sent = JSON.parse(calls[0].init.body);
    assert.ok(sent.contents[0].parts[0].text.includes('انگلیسی'));
    assert.equal(sent.contents[0].parts[1].inlineData.mimeType, 'audio/mp4');
    const fa = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'audio/webm', data: 'AAAA', language: 'xx' }, cookie: 'tok' }), env);
    assert.equal(fa.status, 200);
    assert.ok(JSON.parse(calls[1].init.body).contents[0].parts[0].text.includes('فارسی'));
  });
});

test('خطای پیش‌بینی‌نشده در مسیر هوش مصنوعی (مثل خطای D1) پاسخ JSON با کد AI_UNAVAILABLE می‌دهد، نه استثنای خام', async () => {
  const brokenDb = { prepare() { throw new Error('D1_ERROR secret-detail'); } };
  const res = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'audio/mp4', data: 'AAAA' }, cookie: 'tok' }), { DB: brokenDb, GEMINI_API_KEY: KEY });
  const text = await res.text();
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(text).error, 'AI_UNAVAILABLE');
  assert.ok(!text.includes('secret-detail'));
  assert.equal(JSON.parse(text).stage, 'router');
});

test('تایپ صوتی: خطای موقت Gemini یک بار تکرار می‌شود ولی سهمیه تکرار نمی‌شود', async () => {
  const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
  const ok = jsonRes(200, { candidates: [{ content: { parts: [{ text: 'سلام' }] }, finishReason: 'STOP' }] });
  let n = 0;
  await withFetch(async () => (++n === 1 ? jsonRes(503, { error: { status: 'UNAVAILABLE' } }) : ok.clone()), async (calls) => {
    const res = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'audio/mp4', data: 'AAAA' }, cookie: 'tok' }), env);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).text, 'سلام');
    assert.equal(calls.length, 2);
  });
  await withFetch(async () => jsonRes(429, { error: { status: 'RESOURCE_EXHAUSTED' } }), async (calls) => {
    const res = await worker.fetch(req('/api/ai/transcribe', { body: { mimeType: 'audio/mp4', data: 'AAAA' }, cookie: 'tok' }), env);
    assert.equal(res.status, 429);
    assert.equal(calls.length, 1);
  });
});


test('مواد ۵۶ و ۵۷ قانون اجرای احکام مدنی در انتقال مال توقیف‌شده جدا و بدون تلفیق تحلیل می‌شوند', () => {
  const prompt = assistantSystemPrompt({
    mode: 'consult',
    legalContext: 'قانون اجرای احکام مدنی؛ توقیف مال و انتقال ملک توقیف‌شده',
  });
  assert.match(prompt, /ماده ۵۶ نقل‌وانتقال/);
  assert.match(prompt, /ماده ۵۷ قرارداد یا تعهد/);
  assert.match(prompt, /استثنای رضایت کتبی ماده ۵۷ را به متن ماده ۵۶ اضافه یا با آن ادغام نکن/);
  assert.match(prompt, /توقیف را با مالکیت شخص ثالث یا مستحق‌للغیر درآمدن مبیع یکی ندان/);
  assert.match(prompt, /نقل‌قول ترکیبی نکن/);
});


test('میز محاکمه سه عامل مستقل را جداگانه اجرا می‌کند و گزارش واحد می‌سازد', async () => {
  const roleCalls = [];
  await withFetch(async (url, init) => {
    assert.ok(url.includes('generativelanguage.googleapis.com'));
    const sent = JSON.parse(init.body);
    const system = sent.systemInstruction.parts[0].text;
    const contents = sent.contents || [];
    assert.match(JSON.stringify(contents), /فروشنده در قرارداد آزادی ملک را تضمین کرده است/);
    assert.match(system, /حافظه استدلال پرونده/);
    assert.match(system, /کنترل خواسته‌ها/);
    let answer;
    if (system.includes('قوی‌ترین دفاع‌ها، ایرادهای شکلی و ماهوی')) {
      roleCalls.push('opposing');
      answer = 'دفاع فروشنده: خواسته خریدار با ایراد تعارض خواسته‌ها روبه‌رو است.';
    } else if (system.includes('ابتدا همه ایرادهای مطرح‌شده')) {
      roleCalls.push('client');
      answer = 'پاسخ خریدار: اظهار خلاف واقع فروشنده و جهل خریدار باید بررسی شود.';
    } else if (system.includes('قاضی بی‌طرف و ارزیاب')) {
      roleCalls.push('judge');
      const judgeInput = contents.map((item) => (item.parts || []).map((part) => part.text || '').join(' ')).join(' ');
      assert.match(judgeInput, /دفاع فروشنده/);
      assert.match(judgeInput, /پاسخ خریدار/);
      answer = 'جمع‌بندی قاضی: تعارض خواسته‌ها و مبنای خسارت باید روشن شود.';
    } else {
      throw new Error('نقش ناشناخته در میز محاکمه');
    }
    return jsonRes(200, { candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }] });
  }, async (calls) => {
    const env = { DB: fakeDb({ loggedIn: true }), GEMINI_API_KEY: KEY };
    const res = await worker.fetch(req('/api/ai/assistant', {
      body: {
        mode: 'litigation',
        docType: 'retrial',
        message: 'پرونده انتقال مال توقیف‌شده را از سه موضع بررسی کن.',
        history: [{ role: 'user', text: 'در گفت‌وگوی قبلی احراز شد که فروشنده در قرارداد آزادی ملک را تضمین کرده است.' }],
      },
      cookie: 'tok',
    }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(calls.length, 3);
    assert.deepEqual(roleCalls.sort(), ['client', 'judge', 'opposing']);
    assert.match(data.text, /استدلال مستقل وکیل طرف مقابل/);
    assert.match(data.text, /پاسخ وکیل موکل/);
    assert.match(data.text, /ارزیابی و جمع‌بندی قاضی بی‌طرف/);
  });
});
