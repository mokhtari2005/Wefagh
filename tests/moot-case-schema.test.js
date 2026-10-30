import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCase, AREAS, DIFFICULTIES } from '../worker/src/moot/caseSchema.js';

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
    legal_refs: [{ text: 'ماده ۲۱۹ قانون مدنی', source: 'قانون مدنی، ماده ۲۱۹', verified: true }],
    judge_questions: ['تاریخ دقیق تحویل چه بود؟', 'آیا خریدار اخطار داده است؟', 'مدرک تأمین مواد کجاست؟'],
    strengths_weaknesses: {
      plaintiff: { strengths: ['قرارداد مکتوب'], weaknesses: ['اخطار رسمی ارائه نشده'] },
      defendant: { strengths: ['ادعای قوه قاهره'], weaknesses: ['مدرکی برای تأمین مواد ندارد'] },
    },
    defense_scenarios: [
      { trigger: 'ادعای تأخیر ناشی از تأمین مواد', response: 'مدرک تأمین مواد باید ارائه شود.' },
      { trigger: 'ادعای قوه قاهره', response: 'قوه قاهره باید اثبات شود و اخطار داده شود.' },
    ],
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
  for (const key of ['facts', 'issues', 'judge_questions', 'defense_scenarios', 'verdict', 'legal_refs', 'documents']) {
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

test('published case must have only verified citations', () => {
  const c = sample({ legal_refs: [{ text: 'ماده ۱', source: 'منبع', verified: false }] });
  assert.equal(validateCase(c).ok, true, 'draft may carry unverified citations');
  const pub = validateCase(c, { status: 'published' });
  assert.equal(pub.ok, false);
  assert.match(pub.errors.join(' '), /استناد تأییدنشده/);
});

test('verdict must be substantive', () => {
  assert.equal(validateCase(sample({ verdict: { outcome: 'ok', reasoning: 'کوتاه' } })).ok, false);
});
