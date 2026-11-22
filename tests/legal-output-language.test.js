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
