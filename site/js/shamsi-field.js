// فیلد ورودی تاریخ شمسی (متنی). انتخاب‌گر تاریخ مرورگر میلادی است، پس از این فیلد استفاده می‌کنیم.
import { h } from './dom.js';

export function shamsiField(id, label, { value = '', required = false } = {}) {
  const attrs = { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '10', placeholder: 'مثال: ۱۴۰۵/۰۸/۰۶', id };
  if (value) attrs.value = value;
  if (required) attrs.required = '';
  const input = h('input', attrs);
  const node = h('div', { class: 'field' }, [h('label', { for: id, text: label }), input]);
  return { node, input };
}
