CREATE TABLE IF NOT EXISTS hunt_outcomes (
  user_id TEXT NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 200),
  signal_id TEXT NOT NULL CHECK (char_length(signal_id) BETWEEN 1 AND 300),
  availability_episode_id TEXT NOT NULL CHECK (char_length(availability_episode_id) BETWEEN 1 AND 400),
  outcome TEXT NOT NULL CHECK (outcome IN ('found_it', 'gone_when_checked', 'didnt_go')),
  source_type TEXT NOT NULL CHECK (source_type IN ('member', 'retailer', 'trusted_source', 'release_source')),
  state_code CHAR(2),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, availability_episode_id),
  CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$'),
  CHECK (updated_at >= submitted_at)
);

CREATE INDEX IF NOT EXISTS hunt_outcomes_updated_idx
  ON hunt_outcomes (updated_at DESC);

CREATE INDEX IF NOT EXISTS hunt_outcomes_source_updated_idx
  ON hunt_outcomes (source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS hunt_outcomes_state_updated_idx
  ON hunt_outcomes (state_code, updated_at DESC)
  WHERE state_code IS NOT NULL;
