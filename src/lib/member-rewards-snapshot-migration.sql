ALTER TABLE signal_point_reward_generations ADD COLUMN IF NOT EXISTS member_rewards_snapshot JSONB;

CREATE OR REPLACE FUNCTION reconcile_signal_point_source_set(
  p_user_id TEXT,
  p_source_prefix TEXT,
  p_generation BIGINT,
  p_targets JSONB,
  p_idempotency_key TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(balance INTEGER,debt INTEGER,applied BOOLEAN,generation BIGINT) LANGUAGE plpgsql AS $$
DECLARE generation_row signal_point_reward_generations%ROWTYPE; target RECORD; source RECORD; account_row signal_point_accounts%ROWTYPE;
BEGIN
  IF p_generation < 0 THEN RAISE EXCEPTION 'Signal Points reward generation cannot be negative'; END IF;
  IF COALESCE(TRIM(p_source_prefix),'')='' THEN RAISE EXCEPTION 'Signal Points source prefix is required'; END IF;
  IF jsonb_typeof(p_targets) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Signal Points source targets must be an array'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_targets) item
    WHERE jsonb_typeof(item)<>'object'
      OR jsonb_typeof(item->'sourceKey')<>'string'
      OR jsonb_typeof(item->'targetPoints')<>'number'
      OR (item->>'targetPoints')::numeric <> TRUNC((item->>'targetPoints')::numeric)
      OR (item->>'targetPoints')::numeric < 0
      OR (item->>'targetPoints')::numeric > 2147483647
      OR (item ? 'metadata' AND item->'metadata'<>'null'::jsonb AND jsonb_typeof(item->'metadata')<>'object')
      OR (item->>'sourceKey' <> p_source_prefix AND LEFT(item->>'sourceKey',LENGTH(p_source_prefix)+1) <> p_source_prefix||':')
  ) THEN RAISE EXCEPTION 'Invalid Signal Points source target'; END IF;
  IF (SELECT COUNT(*) FROM jsonb_array_elements(p_targets)) <>
     (SELECT COUNT(DISTINCT item->>'sourceKey') FROM jsonb_array_elements(p_targets) item) THEN
    RAISE EXCEPTION 'Duplicate Signal Points source target';
  END IF;

  INSERT INTO signal_point_reward_generations(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO generation_row FROM signal_point_reward_generations WHERE user_id=p_user_id FOR UPDATE;
  IF p_generation > generation_row.generation THEN RAISE EXCEPTION 'Signal Points reward generation was not allocated'; END IF;
  INSERT INTO signal_point_accounts(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO account_row FROM signal_point_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF p_generation < generation_row.generation OR p_generation <= generation_row.reconciled_generation THEN
    RETURN QUERY SELECT account_row.balance,account_row.debt,FALSE,generation_row.reconciled_generation;
    RETURN;
  END IF;

  -- Omitted sources are revoked first so a complete snapshot cannot retain or double-count them.
  FOR source IN
    SELECT balances.source_key
    FROM signal_point_source_balances balances
    WHERE balances.user_id=p_user_id
      AND (balances.source_key=p_source_prefix OR LEFT(balances.source_key,LENGTH(p_source_prefix)+1)=p_source_prefix||':')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_targets) item WHERE item->>'sourceKey'=balances.source_key)
    ORDER BY balances.source_key
  LOOP
    PERFORM reconcile_signal_point_source(p_user_id,source.source_key,0,p_idempotency_key,
      (COALESCE(p_metadata,'{}'::jsonb)-'rewardSnapshot')||jsonb_build_object('generation',p_generation,'omittedFromSourceSet',TRUE));
  END LOOP;

  FOR target IN
    SELECT item->>'sourceKey' AS source_key,(item->>'targetPoints')::INTEGER AS target_points,
      CASE WHEN jsonb_typeof(item->'metadata')='object' THEN item->'metadata' ELSE '{}'::jsonb END AS metadata
    FROM jsonb_array_elements(p_targets) item
    ORDER BY CASE WHEN item->>'sourceKey'=p_source_prefix||':remainder' THEN 2 WHEN item->>'sourceKey'=p_source_prefix THEN 1 ELSE 0 END,
      item->>'sourceKey'
  LOOP
    PERFORM reconcile_signal_point_source(p_user_id,target.source_key,target.target_points,p_idempotency_key,
      (COALESCE(p_metadata,'{}'::jsonb)-'rewardSnapshot')||target.metadata||jsonb_build_object('generation',p_generation,'targetPoints',target.target_points));
  END LOOP;

  UPDATE signal_point_reward_generations SET reconciled_generation=p_generation,member_rewards_snapshot=COALESCE(p_metadata->'rewardSnapshot',member_rewards_snapshot),updated_at=NOW() WHERE user_id=p_user_id;
  SELECT * INTO account_row FROM signal_point_accounts WHERE user_id=p_user_id;
  RETURN QUERY SELECT account_row.balance,account_row.debt,TRUE,p_generation;
END $$;

CREATE OR REPLACE FUNCTION anonymize_signal_points_member(p_user_id TEXT,p_subject_token TEXT,p_deleted_email TEXT,p_request_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM account_deletion_requests request
    WHERE request.user_id=p_user_id AND request.subject_token=p_subject_token
      AND request.request_id=p_request_id AND request.status='cleanup_queued'
      AND request.subject_token ~ '^deleted:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Signal Points deletion authority is unavailable';
  END IF;
  PERFORM set_config('app.account_deletion_request_id',p_request_id,TRUE);
  INSERT INTO signal_point_accounts(user_id,balance,debt,created_at,updated_at)
  SELECT p_subject_token,balance,debt,created_at,NOW() FROM signal_point_accounts WHERE user_id=p_user_id
  ON CONFLICT(user_id) DO NOTHING;
  UPDATE signal_reward_fulfillments SET
    shipping_profile_user_id=CASE WHEN shipping_profile_user_id=p_user_id THEN p_subject_token ELSE shipping_profile_user_id END,
    shipping_address=CASE WHEN fulfillment_type='physical' THEN jsonb_build_object(
      'recipientName','Deleted member','addressLine1','Retained transaction record','addressLine2',NULL,
      'city','Not retained','stateCode','NA','postalCode','00000','countryCode','US','phone','0000000000'
    ) ELSE NULL END,owner_notes=NULL
  WHERE shipping_profile_user_id=p_user_id;
  UPDATE signal_reward_redemption_events SET actor_id=p_subject_token,metadata='{}'::jsonb
  WHERE actor_id=p_user_id OR redemption_id IN (SELECT id FROM signal_reward_redemptions WHERE user_id=p_user_id);
  UPDATE signal_reward_redemptions SET user_id=p_subject_token,account_email=p_deleted_email,details='{}'::jsonb WHERE user_id=p_user_id;
  UPDATE signal_point_ledger SET user_id=p_subject_token WHERE user_id=p_user_id;
  UPDATE signal_point_source_balances SET user_id=p_subject_token WHERE user_id=p_user_id;
  UPDATE signal_point_reward_generations SET user_id=p_subject_token,member_rewards_snapshot=NULL WHERE user_id=p_user_id;
  DELETE FROM signal_point_accounts WHERE user_id=p_user_id;
  PERFORM set_config('app.account_deletion_request_id','',TRUE);
END $$;
