-- 0035: temporary classroom recording uploads with a strict 48-hour post-class expiry.
CREATE TABLE IF NOT EXISTS classroom_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL UNIQUE REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('video/mp4','video/webm')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 2147483648),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','available')),
  multipart_upload_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS classroom_recording_parts (
  recording_id INTEGER NOT NULL REFERENCES classroom_recordings(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 300),
  etag TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  PRIMARY KEY(recording_id, part_number)
);
CREATE INDEX IF NOT EXISTS idx_classroom_recordings_expiry ON classroom_recordings(status, expires_at);
