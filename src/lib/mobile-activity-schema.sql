CREATE TABLE IF NOT EXISTS member_mobile_activity (
  user_id TEXT NOT NULL CHECK (length(user_id) BETWEEN 1 AND 120),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version VARCHAR(40) NOT NULL,
  update_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, platform),
  CHECK (first_seen_at <= last_seen_at)
);
