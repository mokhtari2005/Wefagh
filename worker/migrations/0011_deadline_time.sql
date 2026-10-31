-- ساعت اختیاری مهلت یا جلسه (HH:MM، وقت تهران). افزودنی و بدون تغییر داده‌های موجود.
ALTER TABLE deadlines ADD COLUMN due_time TEXT CHECK (due_time IS NULL OR (length(due_time) = 5 AND due_time GLOB '[0-2][0-9]:[0-5][0-9]'));
