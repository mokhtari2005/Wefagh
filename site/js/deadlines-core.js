// منطق خالص تقویم مواعد: امروز به وقت تهران، وضعیت هر مهلت، و مرتب‌سازی. قابل تست در Node.

/** @returns {string} تاریخ امروز به وقت تهران به‌صورت YYYY-MM-DD */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * @returns {'done'|'overdue'|'today'|'upcoming'}
 */
export function statusOf(item, today) {
  if (item.done) return 'done';
  if (item.dueDate < today) return 'overdue';
  if (item.dueDate === today) return 'today';
  return 'upcoming';
}

export function sortDeadlines(items) {
  return [...items].sort((a, b) => (a.dueDate === b.dueDate ? a.id - b.id : a.dueDate < b.dueDate ? -1 : 1));
}

export const KIND_LABELS = {
  hearing: 'جلسه',
  objection: 'مهلت اعتراض',
  appeal: 'تجدیدنظرخواهی',
  filing: 'تقدیم لایحه یا دادخواست',
  other: 'سایر',
};

export const STATUS_LABELS = {
  done: 'انجام شد',
  overdue: 'گذشته',
  today: 'امروز',
  upcoming: 'پیش رو',
};

/** موارد نزدیک: انجام‌نشده، از امروز به بعد (یا گذشته‌های عقب‌افتاده) */
export function upcomingOpen(items, today, limit = 5) {
  return sortDeadlines(items.filter((i) => !i.done && i.dueDate >= today)).slice(0, limit);
}
