CREATE TABLE IF NOT EXISTS welcome_signal_previews (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS welcome_signal_previews_expires_idx
  ON welcome_signal_previews (expires_at DESC);
