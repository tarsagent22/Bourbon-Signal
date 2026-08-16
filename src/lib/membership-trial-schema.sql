CREATE TABLE IF NOT EXISTS membership_trial_claims (
  user_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('standard_monthly', 'barrel_monthly')),
  source TEXT NOT NULL DEFAULT 'membership_checkout',
  checkout_session_id TEXT UNIQUE,
  trial_ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'converted', 'canceled')),
  started_at TIMESTAMPTZ NOT NULL,
  converted_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS membership_trial_claims_status_idx
  ON membership_trial_claims (status, updated_at DESC);
