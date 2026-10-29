import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionPlan, buildEvaluationReport, reportToText, QUESTION_COUNT, DISCLAIMER } from '../site/js/moot-oral.js';

test('نقش پرسش‌گرها یکی در میان است و تعداد پرسش ثابت است', () => {
  const plan = questionPlan();
  assert.equal(plan.length, QUESTION_COUNT);
  assert.deepEqual(plan.map((q) => q.role), ['judge', 'opposing', 'judge', 'opposing']);
  for (const q of plan) assert.ok(q.prompt.length > 10);
});

test('پاسخ خالی امتیاز صفر می‌گیرد و در میانگین حساب می‌شود', () => {
  const plan = questionPlan();
  const report = buildEvaluationReport([
    { ...plan[0], answer: '' },
    { ...plan[1], answer: 'زیرا قرارداد در بند سوم تاریخ تحویل را مشخص کرده است، بنابراین تأخیر محرز است و درخواست ما رد دعوای خسارت است.' },
    { ...plan[2], answer: '' },
    { ...plan[3], answer: '' },
  ]);
  assert.equal(report.rows[0].score, 0);
  assert.ok(report.rows[1].score > 0);
  assert.equal(report.average, Math.round(report.rows[1].score / 4));
  assert.equal(report.disclaimer, DISCLAIMER);
});

test('گزارش متنی شامل میانگین و سلب مسئولیت است و HTML ندارد', () => {
  const plan = questionPlan();
  const report = buildEvaluationReport(plan.map((q) => ({ ...q, answer: '<b>x</b>' })));
  const text = reportToText(report);
  assert.match(text, /میانگین/);
  assert.ok(text.includes(DISCLAIMER));
  assert.ok(!text.includes('<b>'));
});

test('امتیاز همیشه بین ۰ و ۱۰۰ است', () => {
  const plan = questionPlan();
  const report = buildEvaluationReport(plan.map((q) => ({ ...q, answer: 'زیرا در نتیجه درخواست خسارت و اثبات قرارداد بند ۴۰ اگر در صورت احراز' })));
  for (const r of report.rows) assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(report.average >= 0 && report.average <= 100);
});
