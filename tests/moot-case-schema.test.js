import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCase, validRef, AREAS, DIFFICULTIES } from '../worker/src/moot/caseSchema.js';

function sample(overrides = {}) {
  return {
    id: 'sale-delay-001',
    title: 'تأخیر در تحویل کالا',
    area: AREAS[0],
    difficulty: 'basic',
    subject: 'مطالبهٔ خسارت تأخیر در تحویل کالا',
    parties: { plaintiff: 'شرکت «ب» (خریدار)', defendant: 'آقای «الف» (فروشنده)' },
    request: { claim: 'خسارت تأخیر و فسخ جزئی', amount: '۱۰۰ میلیون ریال' },
    facts: ['قرارداد خرید ۱۰۰ دستگاه منعقد شد.', 'تاریخ تحویل در قرارداد درج شد.', 'فروشنده تا ۴۰ روز تحویل نداد.'],
    documents: [{ title: 'قرارداد خرید', summary: 'متن قرارداد با تاریخ تحویل.' }],
    issues: ['آیا تأخیر محرز است؟', 'آیا فسخ جزئی ممکن است؟'],
    claims: { plaintiff: 'تأخیر محرز و خسارت قابل مطالبه است.', defendant: 'تأخیر به دلیل تأخیر در تأمین مواد بوده است.' },
    legal_refs: [{ law: 'قانون مدنی', topic: 'لزوم انجام تعهد و زمان تحویل', article: '۲۱۹', source: 'متن رسمی قانون مدنی', status: 'verified' }],
    judge_questions: ['تاریخ دقیق تحویل چه بود؟', 'آیا خریدار اخطار داده است؟', 'مدرک تأمین مواد کجاست؟'],
    strengths_weaknesses: {
      plaintiff: { strengths: ['قرارداد مکتوب'], weaknesses: ['اخطار رسمی ارائه نشده'] },
      defendant: { strengths: ['ادعای قوه قاهره'], weaknesses: ['مدرکی برای تأمین مواد ندارد'] },
    },
    defense_scenarios: [
      { trigger: 'ادعای تأخیر ناشی از تأمین مواد', response: 'مدرک تأمین مواد باید ارائه شود.' },
      { trigger: 'ادعای قوه قاهره', response: 'قوه قاهره باید اثبات شود و اخطار داده شود.' },
    ],
    evaluation_focus: ['استناد به قرارداد', 'پاسخ به پرسش‌های قاضی', 'مدیریت بار اثبات'],
    verdict: { outcome: 'تأخیر محرز؛ خسارت تأخیر قابل مطالبه.', reasoning: 'قرارداد تاریخ تحویل را معین کرده و فروشنده مدرک معذوریت ارائه نکرده است.' },
    ...overrides,
  };
}

test('a complete case passes validation', () => {
  assert.deepEqual(validateCase(sample()), { ok: true });
});

test('areas and difficulties match the spec', () => {
  assert.equal(AREAS.length, 20);
  assert.deepEqual(DIFFICULTIES, ['basic', 'medium', 'advanced']);
});

test('missing required sections are reported', () => {
  for (const key of ['facts', 'issues', 'judge_questions', 'defense_scenarios', 'verdict', 'legal_refs', 'documents', 'evaluation_focus']) {
    const c = sample();
    delete c[key];
    const r = validateCase(c);
    assert.equal(r.ok, false, `${key} should be required`);
  }
});

test('unknown area and difficulty are rejected', () => {
  assert.equal(validateCase(sample({ area: 'حوزهٔ ساختگی' })).ok, false);
  assert.equal(validateCase(sample({ difficulty: 'expert' })).ok, false);
});

test('ids must be lowercase latin slugs', () => {
  assert.equal(validateCase(sample({ id: 'پرونده-۱' })).ok, false);
  assert.equal(validateCase(sample({ id: 'Sale_01' })).ok, false);
});

test('draft may carry unreviewed citations, published may not', () => {
  const c = sample({ legal_refs: [{ law: 'قانون مدنی', topic: 'خیار تأخیر', article: null, status: 'needs_review' }] });
  assert.equal(validateCase(c).ok, true, 'draft with needs_review is allowed');
  const pub = validateCase(c, { status: 'published' });
  assert.equal(pub.ok, false);
  assert.match(pub.errors.join(' '), /استناد بررسی‌نشده/);
});

test('verified citation needs article and source; corrected needs note', () => {
  assert.equal(validRef({ law: 'قانون مدنی', topic: 'موضوع', article: null, status: 'verified' }), false);
  assert.equal(validRef({ law: 'قانون مدنی', topic: 'موضوع', article: '۱', status: 'verified' }), false);
  assert.equal(validRef({ law: 'قانون مدنی', topic: 'موضوع', article: '۱', source: 'متن رسمی', status: 'verified' }), true);
  assert.equal(validRef({ law: 'قانون مدنی', topic: 'موضوع', article: '۱', source: 'متن رسمی', status: 'corrected' }), false);
  assert.equal(validRef({ law: 'قانون مدنی', topic: 'موضوع', article: '۱', source: 'متن رسمی', note: 'اصلاح شماره ماده', status: 'corrected' }), true);
});

test('unknown citation status is rejected', () => {
  assert.equal(validRef({ law: 'قانون مدنی', topic: 'موضوع', article: null, status: 'maybe' }), false);
});

test('verdict must be substantive', () => {
  assert.equal(validateCase(sample({ verdict: { outcome: 'ok', reasoning: 'کوتاه' } })).ok, false);
});
