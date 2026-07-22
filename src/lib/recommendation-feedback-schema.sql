CREATE TABLE IF NOT EXISTS bourbon_recommendation_feedback_state (
  user_id TEXT PRIMARY KEY,
  reset_at TIMESTAMPTZ,
  legacy_migrated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bourbon_recommendation_feedback (
  user_id TEXT NOT NULL,
  canonical_key TEXT NOT NULL CHECK (char_length(canonical_key) BETWEEN 1 AND 180),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, canonical_key)
);

CREATE INDEX IF NOT EXISTS bourbon_recommendation_feedback_user_updated_idx
  ON bourbon_recommendation_feedback (user_id, updated_at DESC);
