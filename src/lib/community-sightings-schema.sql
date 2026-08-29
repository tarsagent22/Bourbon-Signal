CREATE TABLE IF NOT EXISTS community_sightings (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_sightings_created_idx ON community_sightings (created_at DESC);
CREATE INDEX IF NOT EXISTS community_sightings_reporter_created_idx ON community_sightings (reporter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_sighting_idempotency (
  binding_id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  sighting_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_sighting_idempotency_reporter_idx
  ON community_sighting_idempotency (reporter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS signal_point_reward_generations (
  user_id TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 0 CONSTRAINT signal_point_reward_generation_nonnegative CHECK (generation >= 0),
  reconciled_generation BIGINT NOT NULL DEFAULT -1 CONSTRAINT signal_point_reward_reconciled_generation_valid CHECK (reconciled_generation >= -1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION next_community_sighting_reward_generation(p_user_id TEXT)
RETURNS BIGINT LANGUAGE SQL AS $$
  INSERT INTO signal_point_reward_generations(user_id,generation)
  VALUES(p_user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET generation=signal_point_reward_generations.generation+1,updated_at=NOW()
  RETURNING generation
$$;

CREATE TABLE IF NOT EXISTS community_sighting_votes (
  sighting_id TEXT NOT NULL REFERENCES community_sightings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sighting_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_sighting_votes_sighting_idx ON community_sighting_votes (sighting_id);

CREATE TABLE IF NOT EXISTS community_contributor_moderation (
  reporter_user_id TEXT PRIMARY KEY,
  restriction_kind TEXT NOT NULL CHECK (restriction_kind IN ('spam', 'deception')),
  restriction_reason TEXT NOT NULL,
  restricted_at TIMESTAMPTZ NOT NULL,
  restricted_by TEXT NOT NULL,
  restoration_reason TEXT,
  restored_at TIMESTAMPTZ,
  restored_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_contributor_moderation_restricted_idx
  ON community_contributor_moderation (restricted_at DESC);

CREATE TABLE IF NOT EXISTS community_sighting_alert_authority (
  sighting_id TEXT PRIMARY KEY REFERENCES community_sightings(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL,
  report_created_at TIMESTAMPTZ NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_sighting_alert_authority_reporter_idx
  ON community_sighting_alert_authority (reporter_user_id, report_created_at DESC);
