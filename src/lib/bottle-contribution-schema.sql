CREATE TABLE IF NOT EXISTS bottle_contributions (
  id TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bottle_contributions_updated_idx ON bottle_contributions (updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bottle_contributions_actionable_name_idx
  ON bottle_contributions (normalized_name) WHERE status IN ('new', 'needs_human');
