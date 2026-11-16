import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK_CASES } from '../worker/src/moot/bank/index.js';
import { validateCase } from '../worker/src/moot/caseSchema.js';
import { publicCase } from '../worker/src/moot/caseStore.js';
import { COURSES } from '../worker/src/academy/catalog.js';

test('bank contains at least 200 unique, structurally valid training scenarios', () => {
  assert.ok(BANK_CASES.length >= 200, `expected at least 200 cases, got ${BANK_CASES.length}`);
  const ids = BANK_CASES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'case IDs must be unique');
  const invalid = BANK_CASES.flatMap((item) => {
    const result = validateCase(item, { status: 'draft' });
    return result.ok ? [] : [{ id: item.id, errors: result.errors }];
  });
  assert.deepEqual(invalid, [], JSON.stringify(invalid.slice(0, 10), null, 2));
  const publishedInvalid = BANK_CASES.flatMap((item) => {
    const training = {
      ...item,
      scenario_type: 'hypothetical',
      training_only: true,
      publication_note: 'سناریوی فرضی آموزشی برای تمرین دادرسی است؛ رأی واقعی نیست و استنادها نیازمند بررسی‌اند.',
    };
    const result = validateCase(training, { status: 'published' });
    return result.ok ? [] : [{ id: item.id, errors: result.errors }];
  });
  assert.deepEqual(publishedInvalid, [], JSON.stringify(publishedInvalid.slice(0, 10), null, 2));
  const publicView = publicCase({
    ...BANK_CASES[0],
    scenario_type: 'hypothetical',
    training_only: true,
    publication_note: 'سناریوی فرضی آموزشی برای تمرین دادرسی است؛ رأی واقعی نیست و استنادها نیازمند بررسی‌اند.',
  });
  assert.equal(publicView.trainingOnly, true);
  assert.equal('verdict' in publicView, false, 'training verdict must not be exposed to learners');
  assert.equal(publicView.legalRefs[0].article, null, 'unverified article numbers must not be exposed');
});

test('academy has six complete practical courses available to learners', () => {
  const practical = COURSES.filter((course) => course.status === 'published');
  assert.ok(practical.length >= 6);
  for (const course of practical) {
    assert.ok(course.title.length >= 5);
    assert.ok(course.summary.length >= 20);
    assert.ok(course.lessons.length >= 5);
    assert.equal(new Set(course.lessons.map((lesson) => lesson.id)).size, course.lessons.length);
    for (const lesson of course.lessons) {
      assert.ok(lesson.body.length >= 100, `${course.id}/${lesson.id} lesson is too short`);
    }
  }
});
