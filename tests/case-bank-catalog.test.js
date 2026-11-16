import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_CASES, BANK_REVIEW_LABEL } from '../worker/src/moot/bank/index.js';
import { validateCase } from '../worker/src/moot/caseSchema.js';
import { COURSES } from '../worker/src/academy/catalog.js';

test('بانک تمرین دقیقاً ۲۰۷ سناریوی یکتا و قابل انتشار آموزشی دارد', () => {
  assert.equal(BANK_CASES.length, 207);
  assert.equal(new Set(BANK_CASES.map((c) => c.id)).size, 207);
  for (const c of BANK_CASES) {
    const payload = {
      ...c,
      scenario_type: 'hypothetical',
      training_only: true,
      publication_note: 'سناریوی فرضی آموزشی برای تمرین دادرسی است و رأی واقعی قضایی نیست.',
      review_status: BANK_REVIEW_LABEL,
    };
    const result = validateCase(payload, { status: 'published' });
    assert.deepEqual(result, { ok: true }, `${c.id}: ${(result.errors || []).join('، ')}`);
  }
});

test('سناریوهای بانک به‌صراحت فرضی‌اند و استناد تأییدنشده شماره ماده ندارد', () => {
  for (const c of BANK_CASES) {
    assert.ok(c.legal_refs.length > 0, c.id);
    for (const ref of c.legal_refs) {
      if (ref.status === 'needs_review') assert.equal(ref.article, null, c.id);
    }
  }
});

test('آکادمی دست‌کم شش دورهٔ منتشرشده با محتوای درس دارد', () => {
  const published = COURSES.filter((course) => course.status === 'published');
  assert.ok(published.length >= 6);
  for (const course of published) {
    assert.ok(course.title.length >= 5, course.id);
    assert.ok(course.summary.length >= 20, course.id);
    assert.ok(course.lessons.length >= 5, course.id);
    for (const lesson of course.lessons) {
      assert.ok(lesson.title.length >= 5, `${course.id}/${lesson.id}`);
      assert.ok(lesson.body.length >= 250, `${course.id}/${lesson.id}`);
    }
  }
});
