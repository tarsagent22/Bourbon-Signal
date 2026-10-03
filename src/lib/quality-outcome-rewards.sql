-- Small, bounded rewards for first-hand updates to retailer/source availability.
-- Account locking serializes the daily cap with redemptions and other awards.
CREATE OR REPLACE FUNCTION reconcile_quality_outcome_reward(p_user_id TEXT,p_episode_id TEXT)
RETURNS TABLE(points INTEGER,balance INTEGER) LANGUAGE plpgsql AS $$
DECLARE outcome_row hunt_outcomes%ROWTYPE; prior_award BOOLEAN; daily_count INTEGER;
  source_id TEXT := 'quality_outcome_v1:' || p_episode_id;
  target INTEGER := 0; resulting_balance INTEGER;
BEGIN
  INSERT INTO signal_point_accounts(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  PERFORM 1 FROM signal_point_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO outcome_row FROM hunt_outcomes WHERE user_id=p_user_id AND availability_episode_id=p_episode_id;
  SELECT EXISTS(SELECT 1 FROM signal_point_ledger WHERE user_id=p_user_id AND source_key=source_id AND signal_point_ledger.points>0) INTO prior_award;
  IF outcome_row.outcome IN ('found_it','gone_when_checked') AND outcome_row.source_type IN ('retailer','trusted_source') THEN
    IF prior_award THEN target := 5;
    ELSE
      SELECT COUNT(DISTINCT source_key) INTO daily_count FROM signal_point_ledger
      WHERE user_id=p_user_id AND metadata->>'reason'='outcome_confirmation'
        AND signal_point_ledger.points>0 AND (created_at AT TIME ZONE 'UTC')::date=(NOW() AT TIME ZONE 'UTC')::date;
      IF daily_count<3 AND outcome_row.submitted_at >= NOW()-INTERVAL '24 hours' THEN target := 5; END IF;
    END IF;
  END IF;
  resulting_balance := reconcile_signal_point_source(p_user_id,source_id,target,'quality_outcome_v1',jsonb_build_object('reason','outcome_confirmation'));
  RETURN QUERY SELECT target,resulting_balance;
END $$;
