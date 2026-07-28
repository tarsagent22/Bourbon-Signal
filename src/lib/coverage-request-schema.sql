CREATE TABLE IF NOT EXISTS coverage_requests (
  id TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 16 AND 80),
  user_id TEXT NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 180),
  target_type TEXT NOT NULL CHECK (target_type IN ('state', 'county', 'city', 'store')),
  state_code TEXT NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
  area_key TEXT CHECK (area_key IS NULL OR char_length(area_key) BETWEEN 1 AND 80),
  area_label TEXT NOT NULL CHECK (char_length(area_label) BETWEEN 1 AND 120),
  store_id TEXT CHECK (store_id IS NULL OR char_length(store_id) BETWEEN 1 AND 160),
  store_name TEXT CHECK (store_name IS NULL OR char_length(store_name) BETWEEN 1 AND 180),
  store_address TEXT CHECK (store_address IS NULL OR char_length(store_address) BETWEEN 1 AND 220),
  canonical_target_key TEXT NOT NULL CHECK (char_length(canonical_target_key) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'on_radar', 'improved', 'closed')),
  notification_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  baseline_coverage_fingerprint TEXT NOT NULL CHECK (char_length(baseline_coverage_fingerprint) BETWEEN 1 AND 240),
  improved_coverage_fingerprint TEXT CHECK (improved_coverage_fingerprint IS NULL OR char_length(improved_coverage_fingerprint) BETWEEN 1 AND 240),
  improved_at TIMESTAMPTZ,
  review_notes TEXT CHECK (review_notes IS NULL OR char_length(review_notes) <= 1000),
  requested_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, canonical_target_key),
  CHECK (
    (target_type = 'state' AND store_id IS NULL AND store_name IS NULL)
    OR (target_type = 'county' AND area_key IS NOT NULL AND store_id IS NULL AND store_name IS NULL)
    OR (target_type = 'city' AND area_key IS NOT NULL AND store_id IS NULL AND store_name IS NULL)
    OR (target_type = 'store' AND store_name IS NOT NULL)
  )
);

ALTER TABLE coverage_requests
  ALTER COLUMN notification_enabled SET DEFAULT FALSE;

ALTER TABLE coverage_requests
  DROP CONSTRAINT IF EXISTS coverage_requests_target_type_check;
ALTER TABLE coverage_requests
  ADD CONSTRAINT coverage_requests_target_type_check
  CHECK (target_type IN ('state', 'county', 'city', 'store'));

ALTER TABLE coverage_requests
  DROP CONSTRAINT IF EXISTS coverage_requests_check;
ALTER TABLE coverage_requests
  ADD CONSTRAINT coverage_requests_check
  CHECK (
    (target_type = 'state' AND store_id IS NULL AND store_name IS NULL)
    OR (target_type = 'county' AND area_key IS NOT NULL AND store_id IS NULL AND store_name IS NULL)
    OR (target_type = 'city' AND area_key IS NOT NULL AND store_id IS NULL AND store_name IS NULL)
    OR (target_type = 'store' AND store_name IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS coverage_requests_user_updated_idx
  ON coverage_requests (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS coverage_requests_demand_idx
  ON coverage_requests (status, canonical_target_key, updated_at DESC);
