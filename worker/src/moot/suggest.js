// پیشنهاد چرخشی پرونده‌ها. تابع خالص است: همان ورودی و همان random، همان خروجی.
// اولویت: پرونده‌های دیده‌نشده، سپس کم‌تمرین‌شده، سپس آن‌هایی که مدت بیشتری از آخرین دیدن‌شان گذشته.
// پرونده‌های تکمیل‌شده تا وقتی پرونده‌ی دیگری نباشد پیشنهاد نمی‌شوند، و تنوع حوزه‌ها حفظ می‌شود.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Array<object>} cases خلاصهٔ پرونده‌های منتشرشده (شامل id، area، difficulty)
 * @param {Array<{case_slug: string, views: number, completions: number, last_seen_at: string}>} history
 * @returns {Array<object>} پرونده‌ها با فیلد reason
 */
export function suggestCases(cases, history = [], { count = 5, now = Date.now(), random = Math.random } = {}) {
  const byId = new Map(history.map((h) => [h.case_slug, h]));
  const scored = cases.map((c) => {
    const h = byId.get(c.id);
    const views = h?.views || 0;
    const completions = h?.completions || 0;
    const lastSeen = h?.last_seen_at ? Date.parse(h.last_seen_at) : null;
    const recent = lastSeen !== null && now - lastSeen < DAY_MS;
    // هرچه امتیاز کمتر، اولویت بیشتر.
    const score = (views > 0 ? 2 : 0) + completions * 3 + (recent ? 2 : 0);
    const reason = views === 0 ? 'جدید' : completions > 0 ? 'تکمیل‌شده' : recent ? 'اخیراً دیده‌شده' : 'کم‌تمرین‌شده';
    return { c, score: score + random() * 0.9, reason };
  }).sort((a, b) => a.score - b.score);

  const picked = [];
  const usedAreas = new Set();
  // مرحلهٔ اول: حداکثر یک پرونده از هر حوزه، تا تنوع حفظ شود.
  for (const item of scored) {
    if (picked.length >= count) break;
    if (usedAreas.has(item.c.area)) continue;
    usedAreas.add(item.c.area);
    picked.push(item);
  }
  // مرحلهٔ دوم: اگر تعداد کافی نشد، باقی‌مانده بر اساس امتیاز.
  for (const item of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.map(({ c, reason }) => ({ ...c, reason }));
}
