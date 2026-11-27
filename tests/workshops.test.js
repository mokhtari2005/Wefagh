import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WORKSHOPS, EXERCISES } from '../site/js/workshops.js';
import { WORKSHOP_COURSES, WORKSHOP_ACTIVITIES } from '../worker/src/academy/workshop-courses.js';
import { findCourse } from '../worker/src/academy/catalog.js';
import { lessonLearning } from '../worker/src/academy/learning.js';
import { PRACTICAL_COMPETENCIES, getPracticalGuide } from '../worker/src/academy/practical-assessment.js';
import { VERIFIED_CASE_STUDIES } from '../worker/src/academy/case-studies.js';
import { handleAcademy } from '../worker/src/academy/routes.js';

test('کارگاه‌های مهارت‌محور برای سه گروه مخاطب تعریف شده‌اند', () => {
  assert.equal(WORKSHOPS.length, 13);
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

test('کارگاه‌های معرفی‌شده به محتوای تعاملی واقعی و قابل ثبت‌نام متصل‌اند', () => {
  const linked = new Set(WORKSHOPS.flatMap(item => item.courseIds || []));
  assert.ok(linked.size >= 8);
  for (const id of linked) {
    const course = findCourse(id);
    assert.ok(course, 'محتوای کارگاه ' + id + ' در کاتالوگ نیست');
    assert.equal(course.status, 'published');
    assert.equal(course.format, 'workshop');
    assert.equal(course.lessons.length, 5);
    for (const lesson of course.lessons) {
      const activity = lessonLearning(id, lesson.id);
      assert.ok(activity, 'تمرین و آزمونک درس ' + id + '/' + lesson.id + ' موجود نیست');
      assert.ok(activity.assignment.length > 20);
      assert.ok(activity.rubric.length >= 4);
      assert.equal(activity.quiz.options.length, 4);
      assert.ok(activity.quiz.correctIndex >= 0 && activity.quiz.correctIndex < 4);
    }
  }
});

test('دوره‌های تازه کارگاه از داده و آزمونک سمت سرور تغذیه می‌شوند', () => {
  assert.equal(WORKSHOP_COURSES.length, 7);
  for (const course of WORKSHOP_COURSES) {
    assert.equal(course.format, 'workshop');
    assert.equal(WORKSHOP_ACTIVITIES[course.id].length, 5);
  }
});

test('کارآموزی مجازی پنج مرحله عملی با خروجی و معیار ارزیابی مشخص دارد', () => {
  assert.equal(PRACTICAL_COMPETENCIES.length, 7);
  const course = findCourse('virtual-apprenticeship-workshop');
  assert.ok(course);
  for (let index = 1; index <= 5; index += 1) {
    const lessonId = 'l' + index;
    const guide = getPracticalGuide(course.id, lessonId);
    const learning = lessonLearning(course.id, lessonId);
    assert.ok(guide);
    assert.equal(guide.number, index);
    assert.ok(guide.deliverables.length >= 3);
    assert.ok(guide.checkpoints.length >= 3);
    assert.equal(guide.rubric.length, 4);
    assert.equal(learning.practicalGuide.title, guide.title);
    assert.equal(learning.rubric.length, 4);
  }
  assert.equal(getPracticalGuide('civil-litigation-practice', 'l1'), null);
});

test('مطالعات موردی واقعی از سناریوهای فرضی جدا و به منبع عمومی پیوند دارند', () => {
  const bank = JSON.parse(readFileSync(new URL('../research/case-bank/verified-case-studies.json', import.meta.url), 'utf8'));
  assert.equal(bank.records.length, 2);
  assert.deepEqual(new Set(VERIFIED_CASE_STUDIES.map(item => item.id)), new Set(bank.records.map(item => item.source_id)));
  for (const item of bank.records) {
    assert.equal(item.status, 'reviewed_for_training');
    assert.ok(item.court_document_number);
    assert.ok(item.judgment_date);
    assert.ok(item.source_url.startsWith('https://ara.jri.ac.ir/Judge/Text/'));
    assert.ok(item.procedural_summary.length > 100);
    assert.ok(item.limits.length >= 2);
  }
});

test('API مطالعات موردی عمومی، فقط‌خواندنی و بدون داده هویتی است', async () => {
  const getResponse = await handleAcademy(new Request('https://example.test/api/academy/case-studies'), {}, '/api/academy/case-studies');
  assert.equal(getResponse.status, 200);
  const payload = await getResponse.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.caseStudies.length, 2);
  for (const item of payload.caseStudies) {
    assert.ok(item.sourceUrl.startsWith('https://ara.jri.ac.ir/'));
    assert.equal(Object.hasOwn(item, 'personName'), false);
    assert.equal(Object.hasOwn(item, 'nationalId'), false);
  }
  const postResponse = await handleAcademy(new Request('https://example.test/api/academy/case-studies', { method: 'POST' }), {}, '/api/academy/case-studies');
  assert.equal(postResponse.status, 405);
});
