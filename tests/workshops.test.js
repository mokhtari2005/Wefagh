import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSHOPS, EXERCISES } from '../site/js/workshops.js';

test('کارگاه‌های مهارت‌محور برای سه گروه مخاطب تعریف شده‌اند', () => {
  assert.equal(WORKSHOPS.length, 12);
  assert.equal(new Set(WORKSHOPS.map(item => item.id)).size, WORKSHOPS.length);
  assert.ok(WORKSHOPS.some(item => item.level.includes('دانشجو')));
  assert.ok(WORKSHOPS.some(item => item.level.includes('کارآموز')));
  assert.ok(WORKSHOPS.some(item => item.level.includes('وکیل')));
});

test('هر کارگاه تمرین عملی، معیار ارزیابی و پیوند به ابزار موجود دارد', () => {
  for (const workshop of WORKSHOPS) {
    assert.ok(workshop.title.includes('کارگاه'));
    assert.ok(workshop.skills.length >= 4);
    assert.ok(workshop.actions.length >= 2);
    assert.ok(EXERCISES[workshop.id], 'تمرین کارگاه ' + workshop.id + ' تعریف نشده است');
    assert.ok(EXERCISES[workshop.id].task.length > 40);
    assert.ok(EXERCISES[workshop.id].rubric.length >= 4);
  }
});

test('عنوان دانشکده در محتوای قابل نمایش کارگاه‌ها استفاده نشده است', () => {
  const visible = JSON.stringify(WORKSHOPS) + JSON.stringify(EXERCISES);
  assert.equal(visible.includes('دانشکده'), false);
});
