import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantSystemPrompt } from '../worker/src/ai/prompts.js';

test('قاعده زبان فارسی و منع کد و حروف لاتین در همه حالت‌های دستیار اعمال می‌شود', () => {
  for (const mode of ['consult', 'analyze', 'review', 'litigation', 'research', 'draft']) {
    const prompt = assistantSystemPrompt({ mode, docType: 'petition' });
    assert.match(prompt, /فقط فارسی روان و خط فارسی/u);
    assert.match(prompt, /هیچ واژه، جمله، عنوان، نام فنی/u);
    assert.match(prompt, /کد، قطعه برنامه‌نویسی/u);
    assert.match(prompt, /شماره‌ها را با ارقام فارسی/u);
  }
});

test('یادداشت‌های عمومی حذف و استناد احرازنشده به‌صورت مشخص در متن تحلیل مدیریت می‌شود', () => {
  const prompt = assistantSystemPrompt({ mode: 'consult', docType: 'petition' });
  assert.match(prompt, /یادداشت‌های پاسخ فقط باید حاوی نکته عملیاتی یا حقوقی مشخص و ضروری باشند/u);
  assert.match(prompt, /هشدار جداگانه و کلی نده/u);
  assert.match(prompt, /نام قانون یا مرجع مورد بحث را حفظ کن/u);
  assert.match(prompt, /پیش از اعلام فقدان مستند، مسیرهای جایگزین را به‌ترتیب جست‌وجو کن/u);
});
