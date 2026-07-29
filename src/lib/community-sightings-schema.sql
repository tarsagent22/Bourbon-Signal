CREATE TABLE IF NOT EXISTS community_sightings (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_sightings_created_idx ON community_sightings (created_at DESC);
CREATE INDEX IF NOT EXISTS community_sightings_reporter_created_idx ON community_sightings (reporter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_sighting_votes (
  sighting_id TEXT NOT NULL REFERENCES community_sightings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sighting_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_sighting_votes_sighting_idx ON community_sighting_votes (sighting_id);
