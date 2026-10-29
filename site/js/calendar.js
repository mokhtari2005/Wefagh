// تقویم شمسی عمومی: بدون ورود و بدون ذخیرهٔ داده. فقط محاسبهٔ تاریخ در مرورگر.
import { h } from './dom.js';
import { todayIso } from './deadlines-core.js';

const TZ = 'Asia/Tehran';
const DAY_MS = 86400000;
const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const SHORT_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const SHAMSI_PARTS = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
const SHAMSI_TITLE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TZ, year: 'numeric', month: 'long' });
const SHAMSI_DAY = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TZ, day: 'numeric' });

/** @param {string} iso تاریخ میلادی YYYY-MM-DD */
function utcNoon(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

function shamsiPartsOf(date) {
  const parts = {};
  for (const p of SHAMSI_PARTS.formatToParts(date)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/**
 * ماه شمسی‌ای که تاریخ داده‌شده در آن است.
 * @returns {{ title: string, prevIso: string, nextIso: string, cells: Array<{iso: string|null, label: string}> }}
 */
export function shamsiMonth(baseIso) {
  const base = utcNoon(baseIso);
  const { m, d } = shamsiPartsOf(base);
  const start = new Date(base.getTime() - (d - 1) * DAY_MS);
  const cells = [];
  // خانه‌های خالی تا شنبه (هفته از شنبه شروع می‌شود)
  const lead = (start.getUTCDay() + 1) % 7;
  for (let i = 0; i < lead; i++) cells.push({ iso: null, label: '' });
  for (let i = 0; ; i++) {
    const day = new Date(start.getTime() + i * DAY_MS);
    if (shamsiPartsOf(day).m !== m) break;
    cells.push({ iso: isoOf(day), label: SHAMSI_DAY.format(day) });
  }
  // پر کردن خانه‌های انتهای آخرین هفته تا جدول همیشه کامل بماند
  while (cells.length % 7 !== 0) cells.push({ iso: null, label: '' });
  const last = new Date(start.getTime() + (cells.filter((c) => c.iso).length - 1) * DAY_MS);
  return {
    title: SHAMSI_TITLE.format(start),
    prevIso: isoOf(new Date(start.getTime() - DAY_MS)),
    nextIso: isoOf(new Date(last.getTime() + DAY_MS)),
    cells,
  };
}

/** تقویم قابل‌دسترس با کلیدهای ناوبری ماه قبل و بعد. */
export function shamsiCalendar({ todayOverride } = {}) {
  const today = todayOverride || todayIso();
  let base = today;
  const title = h('h2', { class: 'calendar-title', id: 'shamsi-cal-title' });
  const grid = h('div', { class: 'calendar-grid-wrap' });
  const status = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });

  function render() {
    const month = shamsiMonth(base);
    title.textContent = month.title;
    const head = h('tr', {}, WEEKDAYS.map((name, i) => h('th', { scope: 'col', 'aria-label': name, text: SHORT_WEEKDAYS[i] })));
    const rows = [];
    for (let i = 0; i < month.cells.length; i += 7) {
      const tr = h('tr', {});
      for (const cell of month.cells.slice(i, i + 7)) {
        if (!cell.iso) {
          tr.append(h('td', { class: 'cal-empty' }));
          continue;
        }
        const attrs = { class: cell.iso === today ? 'cal-day cal-today' : 'cal-day' };
        if (cell.iso === today) attrs['aria-current'] = 'date';
        tr.append(h('td', attrs, [h('span', { text: cell.label })]));
      }
      rows.push(tr);
    }
    const table = h('table', { class: 'calendar-table' }, [
      h('caption', { class: 'visually-hidden', text: `تقویم ${month.title}` }),
      h('thead', {}, [head]),
      h('tbody', {}, rows),
    ]);
    grid.replaceChildren(table);
    status.textContent = `نمایش ${month.title}`;
    prev.dataset.target = month.prevIso;
    next.dataset.target = month.nextIso;
  }

  const prev = h('button', { class: 'btn-pill cal-nav', type: 'button', 'aria-label': 'ماه قبل', text: '‹ ماه قبل' });
  const next = h('button', { class: 'btn-pill cal-nav', type: 'button', 'aria-label': 'ماه بعد', text: 'ماه بعد ›' });
  const todayBtn = h('button', { class: 'btn-pill cal-nav cal-today-btn', type: 'button', text: 'امروز' });
  prev.addEventListener('click', () => { base = prev.dataset.target; render(); });
  next.addEventListener('click', () => { base = next.dataset.target; render(); });
  todayBtn.addEventListener('click', () => { base = today; render(); });

  const box = h('section', { class: 'calendar-card', 'aria-labelledby': 'shamsi-cal-title' }, [
    h('div', { class: 'calendar-head' }, [prev, title, next]),
    todayBtn,
    grid,
    h('p', { class: 'muted calendar-note', text: 'تقویم عمومی و بدون ورود است. مواعد شخصی پرونده‌ها فقط پس از ورود به حساب دیده می‌شود.' }),
    status,
  ]);
  render();
  return box;
}
