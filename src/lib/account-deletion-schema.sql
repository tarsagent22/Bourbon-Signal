CREATE TABLE IF NOT EXISTS account_deletion_requests (
  user_id TEXT PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 200),
  request_id TEXT NOT NULL UNIQUE CHECK (char_length(request_id) BETWEEN 16 AND 80),
  subject_token TEXT NOT NULL UNIQUE CHECK (char_length(subject_token) BETWEEN 16 AND 120),
  status TEXT NOT NULL CHECK (status IN ('requested', 'cleanup_queued', 'completed')),
  access_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  identity_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  remaining_cleanup JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  cleanup_lease_expires_at TIMESTAMPTZ
);

ALTER TABLE account_deletion_requests
  ADD COLUMN IF NOT EXISTS cleanup_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_updated_idx
  ON account_deletion_requests (status, updated_at);
