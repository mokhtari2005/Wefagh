-- 0033: invitations and in-app notifications for the member community.
CREATE TABLE IF NOT EXISTS community_group_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_pending_invitation
  ON community_group_invitations(group_id,invitee_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_community_invitations_inbox
  ON community_group_invitations(invitee_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS community_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('group_invitation','invitation_response','topic_reply')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body) <= 500),
  href TEXT NOT NULL DEFAULT '/community',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_notifications_user
  ON community_notifications(user_id,is_read,created_at DESC);
