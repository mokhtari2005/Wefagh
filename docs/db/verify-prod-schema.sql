-- Read-only checks for wefagh-db after prod-migrate-0002-0008.sql. Run each statement separately.
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
PRAGMA table_info(user_profiles);
PRAGMA table_info(users);
PRAGMA index_list(sessions);
SELECT COUNT(*) AS users_rows FROM users;
SELECT COUNT(*) AS profile_rows FROM user_profiles;
