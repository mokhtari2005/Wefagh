-- مهاجرت ۰۰۰۸: پروفایل حرفه‌ای و آموزشی کاربر هنگام ثبت‌نام.
-- افزایشی است: جدول users تغییر نمی‌کند و کاربران قبلی ردیف پروفایل ندارند (نمایش خالی، بدون اختلال).
-- ستون‌های اختیاری (شماره پروانه، سال، یادداشت) فقط وقتی پر می‌شوند که کاربر بخواهد.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone               TEXT    NOT NULL UNIQUE CHECK (length(phone) = 11 AND substr(phone, 1, 2) = '09'),
  province            TEXT    NOT NULL CHECK (length(province) BETWEEN 2 AND 60),
  city                TEXT    NOT NULL CHECK (length(city) BETWEEN 2 AND 60),
  professional_status TEXT    NOT NULL CHECK (professional_status IN (
                        'trainee', 'lawyer_p1', 'law_student', 'law_graduate', 'academic', 'other')),
  bar_association     TEXT    CHECK (bar_association IS NULL OR length(bar_association) BETWEEN 2 AND 120),
  license_number      TEXT    CHECK (license_number IS NULL OR length(license_number) BETWEEN 1 AND 30),
  license_year        INTEGER CHECK (license_year IS NULL OR license_year BETWEEN 1340 AND 1420),
  experience_band     TEXT    NOT NULL CHECK (experience_band IN ('none', 'under_2', 'from_2_to_5', 'from_5_to_10', 'over_10')),
  practice_areas      TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(practice_areas)),
  learning_goal       TEXT    NOT NULL CHECK (learning_goal IN (
                        'licence_exam', 'daily_practice', 'advocacy_skills', 'research', 'teaching', 'general_knowledge')),
  skill_areas         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(skill_areas)),
  skill_level         TEXT    NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  learning_format     TEXT    NOT NULL CHECK (learning_format IN (
                        'interactive', 'case_based', 'workshop', 'short_lessons', 'hearing_simulation')),
  notes               TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
