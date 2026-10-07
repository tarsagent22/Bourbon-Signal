-- Run after the community sightings, Signal Points and hunt outcome schemas.
-- Period winners are immutable after settlement. Moderation can revoke recognition.
CREATE TABLE IF NOT EXISTS community_leader_badge_program (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  first_month DATE NOT NULL,
  first_year INTEGER NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version=1)
);
INSERT INTO community_leader_badge_program(id,first_month,first_year)
VALUES(TRUE,date_trunc('month',NOW() AT TIME ZONE 'America/New_York')::date,EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/New_York')::integer)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS community_leader_badge_periods (
  period_key TEXT PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  awarded_at TIMESTAMPTZ,
  policy_version INTEGER NOT NULL DEFAULT 1,
  CHECK (ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS community_leader_badge_awards (
  user_id TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  period_key TEXT NOT NULL REFERENCES community_leader_badge_periods(period_key),
  score INTEGER NOT NULL CHECK (score>0),
  contributions INTEGER NOT NULL CHECK (contributions>0),
  active_days INTEGER NOT NULL CHECK (active_days>0),
  supporting_sighting_ids TEXT[] NOT NULL DEFAULT '{}',
  earned_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY(user_id,badge_id)
);
CREATE INDEX IF NOT EXISTS community_leader_badge_awards_user_idx ON community_leader_badge_awards(user_id,earned_at DESC) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION settle_community_leader_badges(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE(settled_periods INTEGER,awards INTEGER,revoked INTEGER) LANGUAGE plpgsql AS $$
DECLARE first_month DATE; first_year INTEGER; period_row RECORD; period_count INTEGER:=0; award_count INTEGER:=0; revoke_count INTEGER:=0;
BEGIN
  -- One transaction owns admission, scoring, insertion and the closed-period marker.
  PERFORM pg_advisory_xact_lock(hashtext('community_leader_badges_v1'));
  SELECT program.first_month,program.first_year INTO first_month,first_year FROM community_leader_badge_program program WHERE id=TRUE;
  IF first_month IS NULL THEN RAISE EXCEPTION 'Community award program is unavailable'; END IF;
  INSERT INTO community_leader_badge_periods(period_key,starts_at,ends_at)
  SELECT 'month_'||to_char(month_start,'YYYY_MM'),month_start AT TIME ZONE 'America/New_York',(month_start+INTERVAL '1 month') AT TIME ZONE 'America/New_York'
  FROM generate_series(first_month::timestamp,date_trunc('month',p_now AT TIME ZONE 'America/New_York')-INTERVAL '1 month',INTERVAL '1 month') month_start
  UNION ALL
  SELECT 'year_'||year_number,make_date(year_number,1,1)::timestamp AT TIME ZONE 'America/New_York',make_date(year_number+1,1,1)::timestamp AT TIME ZONE 'America/New_York'
  FROM generate_series(first_year,EXTRACT(YEAR FROM p_now AT TIME ZONE 'America/New_York')::integer-1) year_number
  ON CONFLICT(period_key) DO NOTHING;

  UPDATE community_leader_badge_awards a SET revoked_at=p_now WHERE revoked_at IS NULL AND (
    EXISTS(SELECT 1 FROM community_contributor_moderation m WHERE m.reporter_user_id=a.user_id AND (m.restored_at IS NULL OR m.restored_at<m.restricted_at))
    OR EXISTS(SELECT 1 FROM community_sightings s WHERE s.id=ANY(a.supporting_sighting_ids) AND COALESCE(s.payload->'rewardState'->>'rejectedAt','')<>'')
  );
  GET DIAGNOSTICS revoke_count = ROW_COUNT;
  FOR period_row IN SELECT * FROM community_leader_badge_periods WHERE awarded_at IS NULL AND ends_at+INTERVAL '7 days'<=p_now ORDER BY ends_at,period_key LOOP
    WITH eligible AS MATERIALIZED (
      SELECT s.id,s.reporter_user_id,s.payload,s.created_at,(s.created_at AT TIME ZONE 'America/New_York')::date AS active_day,
        ROW_NUMBER() OVER (PARTITION BY s.reporter_user_id,s.payload->>'bottleId',s.payload->>'storeId',(s.created_at AT TIME ZONE 'America/New_York')::date ORDER BY s.created_at,s.id) AS duplicate_rank
      FROM community_sightings s
      WHERE s.created_at>=period_row.starts_at AND s.created_at<period_row.ends_at
        AND s.reporter_user_id<>'' AND COALESCE(s.payload->>'reporterUserId','')=s.reporter_user_id
        AND COALESCE(s.payload->>'sightingType','')='seen_in_store'
        AND COALESCE(s.payload->>'bottleId','')<>'' AND COALESCE(s.payload->>'bottleName','')<>'' AND COALESCE(s.payload->>'storeId','')<>''
        AND COALESCE(s.payload->>'storeId','')!~* '(^|[:_-])manual([:_-]|$)'
        AND COALESCE(s.payload->>'storeState','')<>'' AND COALESCE(s.payload->>'storeCity','')<>'' AND COALESCE(s.payload->>'storeAddress','')<>''
        AND COALESCE(s.payload->'reviewState'->>'needsBottleReview','false')<>'true'
        AND COALESCE(s.payload->'reviewState'->>'needsStoreReview','false')<>'true'
        AND COALESCE(s.payload->'reviewState'->>'manualBottleName','')=''
        AND COALESCE(s.payload->'reviewState'->>'manualBottleRarityTier','')=''
        AND COALESCE(s.payload->'reviewState'->>'manualStoreName','')=''
        AND COALESCE(s.payload->'reviewState'->>'manualStoreAddress','')=''
        AND COALESCE(s.payload->'reviewState'->>'manualStoreCity','')=''
        AND COALESCE(s.payload->'reviewState'->>'manualStoreState','')=''
        AND COALESCE(s.payload->'reviewState'->>'manualStoreZip','')=''
        AND COALESCE(s.payload->'rewardState'->>'removedAt','')=''
        AND COALESCE(s.payload->'rewardState'->>'rejectedAt','')=''
        AND NOT EXISTS(SELECT 1 FROM community_contributor_moderation m WHERE m.reporter_user_id=s.reporter_user_id AND (m.restored_at IS NULL OR m.restored_at<m.restricted_at))
    ), sightings_ranked AS MATERIALIZED (
      SELECT e.*,ROW_NUMBER() OVER (PARTITION BY reporter_user_id,active_day ORDER BY created_at,id) AS daily_rank FROM eligible e WHERE duplicate_rank=1
    ), sightings_scored AS MATERIALIZED (
      SELECT s.reporter_user_id AS user_id,s.active_day,s.id,
        1+CASE WHEN s.payload->'rewardState'->'photoProof'->>'status' IN ('verified_public','verified_private') AND COALESCE(s.payload->'rewardState'->'photoProof'->>'url','')~'^https://' THEN 1 ELSE 0 END
        +CASE WHEN votes.up_count>=3 AND votes.up_count-votes.down_count>=3 THEN 2 ELSE 0 END AS score
      FROM sightings_ranked s LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER(WHERE v.kind='up') AS up_count,COUNT(*) FILTER(WHERE v.kind='down') AS down_count
        FROM community_sighting_votes v WHERE v.sighting_id=s.id AND v.user_id<>s.reporter_user_id AND v.created_at<period_row.ends_at+INTERVAL '7 days'
      ) votes ON TRUE WHERE s.daily_rank<=3
    ), outcomes_ranked AS MATERIALIZED (
      SELECT h.user_id,(h.submitted_at AT TIME ZONE 'America/New_York')::date AS active_day,
        ROW_NUMBER() OVER (PARTITION BY h.user_id,(h.submitted_at AT TIME ZONE 'America/New_York')::date ORDER BY h.submitted_at,h.availability_episode_id) AS daily_rank
      FROM hunt_outcomes h JOIN signal_point_source_balances b ON b.user_id=h.user_id AND b.source_key='quality_outcome_v1:'||h.availability_episode_id AND b.points>0
      WHERE h.submitted_at>=period_row.starts_at AND h.submitted_at<period_row.ends_at
        AND h.source_type IN ('retailer','trusted_source') AND h.outcome IN ('found_it','gone_when_checked')
        AND NOT EXISTS(SELECT 1 FROM community_contributor_moderation m WHERE m.reporter_user_id=h.user_id AND (m.restored_at IS NULL OR m.restored_at<m.restricted_at))
    ), contributions AS MATERIALIZED (
      SELECT user_id,active_day,id,score FROM sightings_scored
      UNION ALL SELECT user_id,active_day,NULL::text,2 FROM outcomes_ranked WHERE daily_rank<=3
    ), totals AS MATERIALIZED (
      SELECT user_id,COUNT(*)::integer AS contributions,COUNT(DISTINCT active_day)::integer AS active_days,SUM(score)::integer AS score,
        COALESCE(array_agg(id) FILTER(WHERE id IS NOT NULL),'{}'::text[]) AS ids
      FROM contributions GROUP BY user_id
      HAVING COUNT(*)>=CASE WHEN period_row.period_key LIKE 'month_%' THEN 5 ELSE 25 END
        AND COUNT(DISTINCT active_day)>=CASE WHEN period_row.period_key LIKE 'month_%' THEN 3 ELSE 12 END
    ), winners AS (
      SELECT user_id,'most_active_'||period_row.period_key AS badge_id,active_days AS score,contributions,active_days,ids FROM totals WHERE active_days=(SELECT MAX(active_days) FROM totals)
      UNION ALL
      SELECT user_id,'top_contributor_'||period_row.period_key,score,contributions,active_days,ids FROM totals WHERE score=(SELECT MAX(score) FROM totals)
    )
    INSERT INTO community_leader_badge_awards(user_id,badge_id,period_key,score,contributions,active_days,supporting_sighting_ids,earned_at)
    SELECT user_id,badge_id,period_row.period_key,score,contributions,active_days,ids,p_now FROM winners ON CONFLICT(user_id,badge_id) DO NOTHING;
    GET DIAGNOSTICS award_count = ROW_COUNT;
    awards:=COALESCE(awards,0)+award_count;
    UPDATE community_leader_badge_periods SET awarded_at=p_now WHERE period_key=period_row.period_key;
    period_count:=period_count+1;
  END LOOP;
  settled_periods:=period_count; awards:=COALESCE(awards,0); revoked:=revoke_count; RETURN NEXT;
END $$;
