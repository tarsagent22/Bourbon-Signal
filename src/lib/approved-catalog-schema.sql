CREATE TABLE IF NOT EXISTS approved_catalog_bottles (
  id TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approved_catalog_bottles_updated_idx ON approved_catalog_bottles (updated_at DESC);

CREATE TABLE IF NOT EXISTS approved_catalog_locations (
  id TEXT PRIMARY KEY,
  normalized_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approved_catalog_locations_updated_idx ON approved_catalog_locations (updated_at DESC);
