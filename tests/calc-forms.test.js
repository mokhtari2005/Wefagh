import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRule } from '../site/js/calc/rates.js';
import { applyRule } from '../site/js/calc/engine.js';
import { computeAttorneyForm, RULE } from '../site/js/calc/attorney-form.js';
import { tierTableRows, tierSection, buildFormModel, renderFormHtml, renderFormText, escapeHtml } from '../site/js/calc/forms.js';

const YEAR = 1405;

test('جدول پلهٔ هزینه دادرسی بدوی با موتور محاسبه یکسان است', () => {
  const rule = findRule(YEAR, 'court-fee-financial-first');
  const amount = 500_000_000;
  const r = applyRule(rule, { amount });
  const rows = tierTableRows(rule, amount, r.fee);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].base, 200_000_000);
  assert.equal(rows[0].fee, 5_000_000);
  assert.equal(rows[1].base, 300_000_000);
  assert.equal(rows[1].fee, 10_500_000);
  assert.equal(rows.reduce((s, x) => s + x.fee, 0), r.fee);
});

test('تجدیدنظر و فرجام و مبلغ ثابت یک ردیف با جمع درست می‌دهند', () => {
  for (const id of ['court-fee-financial-appeal', 'court-fee-financial-cassation', 'court-fee-unknown-value']) {
    const rule = findRule(YEAR, id);
    const r = applyRule(rule, { amount: 1_000_000_000 });
    const rows = tierTableRows(rule, 1_000_000_000, r.fee);
    assert.equal(rows.length, 1, id);
    assert.equal(rows.reduce((s, x) => s + x.fee, 0), r.fee, id);
  }
});

test('جدول حق‌الوکاله جمع ردیف‌ها را برابر نتیجهٔ فرم می‌کند', () => {
  const amount = 3_000_000_000;
  const r = computeAttorneyForm({ subject: 'attorney', caseType: 'financial', judgment: 'nonfinal', amount });
  assert.equal(r.ok, true);
  const rule = findRule(YEAR, RULE.f9Nonfinal);
  const rows = tierTableRows(rule, amount, r.lines[0].amount);
  assert.equal(rows.length, 5);
  assert.equal(rows.reduce((s, x) => s + x.fee, 0), r.lines[0].amount);
  // پله‌های بعد از رسیدن مبلغ صفر هستند و اضافه‌ای ساخته نمی‌شود
  assert.equal(rows[3].base, 0);
});

test('کاربرگ HTML هیچ style درون‌خطی ندارد و متن ورودی escape می‌شود', () => {
  const rule = findRule(YEAR, 'court-fee-financial-first');
  const r = applyRule(rule, { amount: 100_000_000 });
  const model = buildFormModel({
    title: 'هزینهٔ دادرسی <b>',
    inputs: [['نوع', '<script>alert(1)</script>']],
    result: { ok: true, fee: r.fee, limitations: ['نکته'], ruleVersion: 'v' },
    tables: [tierSection('جدول', tierTableRows(rule, 100_000_000, r.fee), 'مستند')],
  });
  const html = renderFormHtml(model, { dateText: '۱۴۰۵/۰۸/۲۹' });
  assert.ok(!/style=/i.test(html), 'style درون‌خطی ممنوع است (CSP)');
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('academy-pdf-table'));
  assert.ok(html.includes('academy-pdf-total'));
  assert.ok(renderFormText(model).includes('مبلغ نهایی محاسبه‌شده'));
  assert.equal(escapeHtml('<&>'), '&lt;&amp;&gt;');
});
