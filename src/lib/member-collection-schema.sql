CREATE TABLE IF NOT EXISTS member_collection_state (
  user_id TEXT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  legacy_migrated_at TIMESTAMPTZ,
  legacy_cleared_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_collection_bottles (
  user_id TEXT NOT NULL REFERENCES member_collection_state(user_id) ON DELETE CASCADE,
  canonical_key TEXT NOT NULL,
  bottle_id TEXT NOT NULL,
  bottle_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 100),
  taste_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  would_buy_again BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  pending_canonical_match BOOLEAN NOT NULL DEFAULT FALSE,
  bottle_contribution_id TEXT,
  payload JSONB NOT NULL,
  added_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, canonical_key)
);

CREATE TABLE IF NOT EXISTS member_collection_legacy_backups (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_collection_bottles_canonical_rating_idx
  ON member_collection_bottles (canonical_key, rating)
  WHERE rating > 0;
CREATE INDEX IF NOT EXISTS member_collection_bottles_user_updated_idx
  ON member_collection_bottles (user_id, updated_at DESC);
