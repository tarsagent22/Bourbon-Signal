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

CREATE TABLE IF NOT EXISTS coverage_request_automation_jobs (
  job_key TEXT PRIMARY KEY CHECK (char_length(job_key) BETWEEN 20 AND 340),
  coverage_request_id TEXT NOT NULL REFERENCES coverage_requests(id) ON DELETE CASCADE,
  request_version TIMESTAMPTZ NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('state', 'county', 'city', 'store')),
  state_code TEXT NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
  area_key TEXT,
  store_id TEXT,
  canonical_target_key TEXT NOT NULL CHECK (char_length(canonical_target_key) BETWEEN 1 AND 180),
  baseline_coverage_fingerprint TEXT NOT NULL CHECK (char_length(baseline_coverage_fingerprint) BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'claimed', 'running', 'notification_pending',
    'notification_sending', 'notified', 'delivery_uncertain', 'failed'
  )),
  lease_token TEXT,
  lease_expires_at TIMESTAMPTZ,
  task_id TEXT UNIQUE,
  terminal_result JSONB,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('improved', 'engine_improved', 'blocked')),
  notification_token TEXT,
  notification_attempted_at TIMESTAMPTZ,
  notification_platform_message_id TEXT,
  retry_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coverage_request_id, baseline_coverage_fingerprint)
);

ALTER TABLE coverage_request_automation_jobs
  ADD COLUMN IF NOT EXISTS retry_history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS coverage_request_automation_single_active_idx
  ON coverage_request_automation_jobs ((TRUE))
  WHERE status IN ('claimed', 'running');

CREATE INDEX IF NOT EXISTS coverage_request_automation_queue_idx
  ON coverage_request_automation_jobs (status, created_at ASC);

INSERT INTO coverage_request_automation_jobs (
  job_key, coverage_request_id, request_version, target_type, state_code,
  area_key, store_id, canonical_target_key, baseline_coverage_fingerprint,
  status, created_at, updated_at
)
SELECT
  'coverage-request:' || id::text || ':' || SUBSTRING(MD5(baseline_coverage_fingerprint) FROM 1 FOR 16),
  id, updated_at, target_type, state_code,
  area_key, store_id, canonical_target_key, baseline_coverage_fingerprint,
  'queued', requested_at, updated_at
FROM coverage_requests
WHERE status = 'requested'
ON CONFLICT (coverage_request_id, baseline_coverage_fingerprint) DO NOTHING;
