CREATE TABLE IF NOT EXISTS member_referral_codes (
  referrer_user_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_referrals (
  referred_user_id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES member_referral_codes(referrer_user_id),
  referral_code TEXT NOT NULL,
  referred_email_hash TEXT NOT NULL,
  highest_tier TEXT NOT NULL DEFAULT 'free' CONSTRAINT member_referrals_highest_tier_valid
    CHECK (highest_tier IN ('free', 'standard', 'barrel', 'bottled-in-bond')),
  awarded_points INTEGER NOT NULL DEFAULT 0 CONSTRAINT member_referrals_awarded_points_valid
    CHECK (awarded_points >= 0 AND awarded_points <= 150),
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_referral_eligibility_events (
  source_event_id TEXT PRIMARY KEY,
  referred_user_id TEXT NOT NULL,
  tier TEXT NOT NULL CONSTRAINT member_referral_eligibility_tier_valid
    CHECK (tier IN ('free', 'standard', 'barrel', 'bottled-in-bond')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_referral_point_ledger (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  tier TEXT NOT NULL CONSTRAINT member_referral_point_tier_valid
    CHECK (tier IN ('free', 'standard', 'barrel', 'bottled-in-bond')),
  reason TEXT NOT NULL CONSTRAINT member_referral_point_reason_valid
    CHECK (reason IN ('referral_free', 'referral_standard', 'referral_barrel', 'referral_founder')),
  points INTEGER NOT NULL CONSTRAINT member_referral_point_value_valid CHECK (points > 0 AND points <= 150),
  source_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_referral_glass_rewards (
  referred_user_id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'address_required' CONSTRAINT member_referral_glass_status_valid
    CHECK (status IN ('address_required', 'address_confirmed', 'packed', 'shipped')),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  address_confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_referrals_referrer_idx
  ON member_referrals (referrer_user_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS member_referral_eligibility_events_user_idx
  ON member_referral_eligibility_events (referred_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_referral_point_ledger_referrer_idx
  ON member_referral_point_ledger (referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_referral_glass_rewards_referrer_idx
  ON member_referral_glass_rewards (referrer_user_id, earned_at DESC);

CREATE TABLE IF NOT EXISTS member_referral_scale_migrations (
  migration_key TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE member_referrals DROP CONSTRAINT IF EXISTS member_referrals_awarded_points_valid;
ALTER TABLE member_referral_point_ledger DROP CONSTRAINT IF EXISTS member_referral_point_value_valid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM member_referral_scale_migrations WHERE migration_key = 'signal-points-10x-v1') THEN
    UPDATE member_referrals SET awarded_points = awarded_points * 10;
    UPDATE member_referral_point_ledger SET points = points * 10;
    INSERT INTO member_referral_scale_migrations (migration_key) VALUES ('signal-points-10x-v1');
  END IF;
END $$;
ALTER TABLE member_referrals ADD CONSTRAINT member_referrals_awarded_points_valid CHECK (awarded_points >= 0 AND awarded_points <= 150);
ALTER TABLE member_referral_point_ledger ADD CONSTRAINT member_referral_point_value_valid CHECK (points > 0 AND points <= 150);

CREATE OR REPLACE FUNCTION referral_tier_rank(value TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE value
    WHEN 'free' THEN 0
    WHEN 'standard' THEN 1
    WHEN 'barrel' THEN 2
    WHEN 'bottled-in-bond' THEN 3
    ELSE -1
  END
$$;

CREATE OR REPLACE FUNCTION reconcile_member_referral_reward(
  p_referred_user_id TEXT,
  p_next_tier TEXT,
  p_source_event_id TEXT DEFAULT NULL
)
RETURNS TABLE(points_awarded INTEGER, target_points INTEGER, founder_glass_earned BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  referral_row member_referrals%ROWTYPE;
  desired_points INTEGER;
  free_points_awarded INTEGER;
  point_delta INTEGER;
  inserted_points INTEGER;
  effective_tier TEXT;
BEGIN
  IF referral_tier_rank(p_next_tier) < 0 THEN
    RAISE EXCEPTION 'Invalid referral membership tier';
  END IF;

  INSERT INTO member_referral_eligibility_events (source_event_id, referred_user_id, tier)
  VALUES (COALESCE(p_source_event_id, 'manual:' || p_referred_user_id || ':' || p_next_tier), p_referred_user_id, p_next_tier)
  ON CONFLICT (source_event_id) DO NOTHING;

  SELECT tier INTO effective_tier
  FROM member_referral_eligibility_events
  WHERE referred_user_id = p_referred_user_id
  ORDER BY referral_tier_rank(tier) DESC, created_at ASC
  LIMIT 1;

  SELECT * INTO referral_row
  FROM member_referrals
  WHERE referred_user_id = p_referred_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, FALSE;
    RETURN;
  END IF;

  PERFORM 1
  FROM member_referral_codes
  WHERE referrer_user_id = referral_row.referrer_user_id
  FOR UPDATE;

  SELECT COALESCE(SUM(points), 0)::INTEGER INTO free_points_awarded
  FROM member_referral_point_ledger
  WHERE referrer_user_id = referral_row.referrer_user_id
    AND reason = 'referral_free';

  desired_points := CASE effective_tier
    WHEN 'free' THEN 10
    WHEN 'standard' THEN 50
    WHEN 'barrel' THEN 100
    WHEN 'bottled-in-bond' THEN 150
  END;

  IF effective_tier = 'free' AND free_points_awarded >= 50 THEN
    desired_points := referral_row.awarded_points;
  END IF;
  desired_points := GREATEST(desired_points, referral_row.awarded_points);
  point_delta := desired_points - referral_row.awarded_points;
  inserted_points := 0;

  IF point_delta > 0 THEN
    INSERT INTO member_referral_point_ledger (
      event_key, referrer_user_id, referred_user_id, tier, reason, points, source_event_id
    ) VALUES (
      'referral:' || p_referred_user_id || ':tier:' || effective_tier,
      referral_row.referrer_user_id,
      p_referred_user_id,
      effective_tier,
      CASE effective_tier
        WHEN 'free' THEN 'referral_free'
        WHEN 'standard' THEN 'referral_standard'
        WHEN 'barrel' THEN 'referral_barrel'
        ELSE 'referral_founder'
      END,
      point_delta,
      p_source_event_id
    )
    ON CONFLICT (event_key) DO NOTHING
    RETURNING points INTO inserted_points;

    inserted_points := COALESCE(inserted_points, 0);
  END IF;

  UPDATE member_referrals
  SET highest_tier = CASE
        WHEN referral_tier_rank(effective_tier) > referral_tier_rank(highest_tier) THEN effective_tier
        ELSE highest_tier
      END,
      awarded_points = GREATEST(awarded_points, desired_points),
      updated_at = NOW()
  WHERE referred_user_id = p_referred_user_id;

  -- Existing glass rows remain durable liabilities. New Bottled-in-Bond referrals earn points only.
  RETURN QUERY SELECT inserted_points, desired_points, FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION claim_member_referral(
  p_referred_user_id TEXT,
  p_referral_code TEXT,
  p_referred_email_hash TEXT
)
RETURNS TABLE(claim_status TEXT, points_awarded INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  code_row member_referral_codes%ROWTYPE;
  existing_referrer TEXT;
  free_award RECORD;
BEGIN
  SELECT * INTO code_row
  FROM member_referral_codes
  WHERE code = UPPER(p_referral_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_code'::TEXT, 0;
    RETURN;
  END IF;
  IF code_row.referrer_user_id = p_referred_user_id OR code_row.email_hash = p_referred_email_hash THEN
    RETURN QUERY SELECT 'self_referral'::TEXT, 0;
    RETURN;
  END IF;

  SELECT referrer_user_id INTO existing_referrer
  FROM member_referrals
  WHERE referred_user_id = p_referred_user_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN existing_referrer = code_row.referrer_user_id THEN 'already_claimed' ELSE 'already_attributed' END, 0;
    RETURN;
  END IF;

  INSERT INTO member_referrals (
    referred_user_id, referrer_user_id, referral_code, referred_email_hash
  ) VALUES (
    p_referred_user_id, code_row.referrer_user_id, code_row.code, p_referred_email_hash
  )
  ON CONFLICT (referred_user_id) DO NOTHING;

  SELECT * INTO free_award
  FROM reconcile_member_referral_reward(p_referred_user_id, 'free', 'clerk:user.created:' || p_referred_user_id);

  RETURN QUERY SELECT 'claimed'::TEXT, COALESCE(free_award.points_awarded, 0)::INTEGER;
END;
$$;
