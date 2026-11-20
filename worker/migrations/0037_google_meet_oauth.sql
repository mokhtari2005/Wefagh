-- 0037: securely persist Google Meet OAuth connection and short-lived OAuth state.
CREATE TABLE IF NOT EXISTS google_meet_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token_encrypted TEXT NOT NULL,
  connected_by INTEGER NOT NULL,
  connected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_meet_oauth_states (
  state_hash TEXT PRIMARY KEY,
  admin_user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_google_meet_oauth_states_expiry ON google_meet_oauth_states(expires_at);
