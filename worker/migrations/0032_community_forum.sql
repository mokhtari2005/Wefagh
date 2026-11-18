-- 0032: عضو-محور community forum; all content is visible only to approved members.
CREATE TABLE IF NOT EXISTS community_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 3 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 500),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_groups_status ON community_groups(status, created_at DESC);
CREATE TABLE IF NOT EXISTS community_group_members (
  group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_group_members_user ON community_group_members(user_id, group_id);
CREATE TABLE IF NOT EXISTS community_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER REFERENCES community_groups(id) ON DELETE SET NULL,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 8 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 20 AND 10000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden')),
  accepted_reply_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_topics_feed ON community_topics(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_topics_group ON community_topics(group_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS community_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES community_topics(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 2 AND 6000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_replies_topic ON community_replies(topic_id,status,created_at);
CREATE TABLE IF NOT EXISTS community_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('topic','reply','group')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_reports(status,created_at DESC);
