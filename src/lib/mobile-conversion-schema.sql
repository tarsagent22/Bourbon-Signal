CREATE TABLE IF NOT EXISTS mobile_conversion_events (
  installation_hash TEXT NOT NULL,
  event TEXT NOT NULL,
  entry TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  coverage TEXT NOT NULL CHECK (coverage IN ('current', 'limited', 'unknown')),
  user_id TEXT,
  event_day DATE NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (installation_hash, event, entry, event_day)
);

CREATE INDEX IF NOT EXISTS mobile_conversion_events_at_idx ON mobile_conversion_events (event_at);
CREATE INDEX IF NOT EXISTS mobile_conversion_events_user_idx ON mobile_conversion_events (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_saved_hunts (
  user_id TEXT PRIMARY KEY,
  saved JSONB CHECK (saved IS NULL OR jsonb_typeof(saved) = 'object'),
  preview_key TEXT
);
