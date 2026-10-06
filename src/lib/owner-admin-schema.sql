CREATE TABLE IF NOT EXISTS owner_bottle_records (
 bottle_id TEXT PRIMARY KEY, patch JSONB NOT NULL DEFAULT '{}', redirect_id TEXT,
 version BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION owner_save_bottle_record(p_id TEXT, p_patch JSONB, p_redirect TEXT, p_expected BIGINT, p_actor TEXT, p_reason TEXT, p_target_expected BIGINT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_version BIGINT; v_before JSONB; v_user TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-catalog-write',0));
 IF p_redirect IS NULL AND EXISTS(SELECT 1 FROM owner_bottle_records WHERE bottle_id<>p_id AND redirect_id IS NULL AND lower(patch->>'canonicalName')=lower(p_patch->>'canonicalName')) THEN RAISE EXCEPTION 'duplicate_bottle'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-bottle:' || lock_id,0)) FROM (SELECT DISTINCT unnest(ARRAY[p_id,p_redirect]) AS lock_id ORDER BY lock_id) ids WHERE lock_id IS NOT NULL;
 SELECT version,patch INTO v_version,v_before FROM owner_bottle_records WHERE bottle_id=p_id FOR UPDATE;
 v_before=COALESCE(v_before,p_patch->'_previous');
 p_patch=p_patch-'_previous';
 IF COALESCE(v_version,0)<>p_expected THEN RAISE EXCEPTION 'admin_conflict'; END IF;
 IF p_redirect IS NOT NULL AND (p_redirect=p_id OR EXISTS(SELECT 1 FROM owner_bottle_records WHERE bottle_id=p_redirect AND redirect_id IS NOT NULL)) THEN RAISE EXCEPTION 'invalid_redirect'; END IF;
 IF p_redirect IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-bottle:' || p_redirect,0));
  IF COALESCE((SELECT version FROM owner_bottle_records WHERE bottle_id=p_redirect),0) IS DISTINCT FROM p_target_expected THEN RAISE EXCEPTION 'admin_conflict'; END IF;
  INSERT INTO owner_bottle_records(bottle_id,patch) VALUES(p_redirect,p_patch)
  ON CONFLICT(bottle_id) DO UPDATE SET patch=EXCLUDED.patch,version=owner_bottle_records.version+1,updated_at=now();
  UPDATE owner_bottle_records SET redirect_id=p_redirect,version=version+1,updated_at=now() WHERE redirect_id=p_id;
 END IF;
 FOR v_user IN SELECT DISTINCT user_id FROM member_collection_bottles WHERE bottle_id=p_id ORDER BY user_id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user,0));
 END LOOP;
 INSERT INTO owner_bottle_records(bottle_id,patch,redirect_id,version) VALUES(p_id,p_patch,p_redirect,1)
 ON CONFLICT(bottle_id) DO UPDATE SET patch=EXCLUDED.patch,redirect_id=EXCLUDED.redirect_id,version=owner_bottle_records.version+1,updated_at=now()
 RETURNING version INTO v_version;
 WITH changed AS (
  UPDATE member_collection_bottles SET bottle_id=COALESCE(p_redirect,p_id),bottle_name=p_patch->>'canonicalName',
   payload=payload || jsonb_build_object('bottleId',COALESCE(p_redirect,p_id),'bottleName',p_patch->>'canonicalName','updatedAt',now()),updated_at=now()
  WHERE bottle_id=p_id RETURNING user_id
 ) UPDATE member_collection_state SET version=version+1,updated_at=now() WHERE user_id IN(SELECT user_id FROM changed);
 UPDATE community_sightings SET payload=payload || jsonb_build_object('bottleId',COALESCE(p_redirect,p_id),'bottleName',p_patch->>'canonicalName'),updated_at=now()
 WHERE payload->>'bottleId'=p_id;
 INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES(p_actor,CASE WHEN p_redirect IS NULL THEN 'bottle_edit' ELSE 'bottle_merge' END,p_id,jsonb_build_object('reason',p_reason,'before',v_before,'after',p_patch,'redirectId',p_redirect));
 RETURN v_version;
END $$;
CREATE OR REPLACE FUNCTION owner_adjust_signal_points(p_user TEXT,p_delta INTEGER,p_key TEXT,p_actor TEXT,p_reason TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_balance INTEGER; v_debt INTEGER; v_bd INTEGER; v_dd INTEGER; v_prior signal_point_ledger%ROWTYPE;
BEGIN
 IF p_delta=0 OR abs(p_delta)>10000 OR length(p_reason)<3 THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;
 INSERT INTO signal_point_accounts(user_id) VALUES(p_user) ON CONFLICT(user_id) DO NOTHING;
 SELECT balance,debt INTO v_balance,v_debt FROM signal_point_accounts WHERE user_id=p_user FOR UPDATE;
 SELECT * INTO v_prior FROM signal_point_ledger WHERE user_id=p_user AND idempotency_key='owner:' || p_key;
 IF FOUND THEN
  IF v_prior.points<>p_delta OR v_prior.metadata->>'reason'<>p_reason OR v_prior.metadata->>'actorId'<>p_actor THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN v_balance;
 END IF;
 IF p_delta>0 THEN v_dd=-LEAST(v_debt,p_delta);v_bd=p_delta+v_dd;
 ELSE v_bd=-LEAST(v_balance,-p_delta);v_dd=-p_delta+v_bd; END IF;
 INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,metadata)
 VALUES(p_user,'owner:' || p_key,CASE WHEN p_delta>0 THEN 'credit' ELSE 'debit' END,p_delta,v_bd,v_dd,'owner_adjustment',jsonb_build_object('reason',p_reason,'actorId',p_actor));
 UPDATE signal_point_accounts SET balance=balance+v_bd,debt=debt+v_dd,updated_at=now() WHERE user_id=p_user RETURNING balance INTO v_balance;
 INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES(p_actor,'member_points_adjustment',p_user,jsonb_build_object('reason',p_reason,'points',p_delta,'requestId',p_key));
 RETURN v_balance;
END $$;
CREATE OR REPLACE FUNCTION owner_resolve_bottle_submission(p_id TEXT,p_expected TIMESTAMPTZ,p_bottle TEXT,p_name TEXT,p_actor TEXT,p_reason TEXT,p_status TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_before JSONB; v_after JSONB; v_user TEXT;
BEGIN
 SELECT payload INTO v_before FROM bottle_contributions WHERE id=p_id AND updated_at=p_expected FOR UPDATE;
 IF v_before IS NULL THEN RAISE EXCEPTION 'admin_conflict'; END IF;
 IF p_status NOT IN ('matched_existing','added','rejected','new') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 FOR v_user IN SELECT DISTINCT user_id FROM member_collection_bottles WHERE bottle_contribution_id=p_id ORDER BY user_id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user,0));
 END LOOP;
 IF p_status IN ('matched_existing','added') THEN
  WITH changed AS (
   UPDATE member_collection_bottles SET bottle_id=p_bottle,bottle_name=p_name,pending_canonical_match=false,
    payload=payload || jsonb_build_object('bottleId',p_bottle,'bottleName',p_name,'pendingCanonicalMatch',false,'updatedAt',now()),updated_at=now()
   WHERE bottle_contribution_id=p_id RETURNING user_id
  ) UPDATE member_collection_state SET version=version+1,updated_at=now() WHERE user_id IN(SELECT user_id FROM changed);
 END IF;
 v_after=v_before || jsonb_build_object('status',p_status,'candidateBottleId',p_bottle,'candidateBottleName',p_name,'notes',p_reason,'updatedAt',now());
 UPDATE bottle_contributions SET status=p_status,payload=v_after,updated_at=now() WHERE id=p_id;
 INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES(p_actor,'bottle_submission_' || p_status,p_id,jsonb_build_object('reason',p_reason,'before',v_before,'after',v_after));
 RETURN v_after;
END $$;

-- Review and catalog creation/edit are one transaction. No reward or availability dispatch.
CREATE OR REPLACE FUNCTION owner_review_bottle_submission(p_id TEXT,p_expected TIMESTAMPTZ,p_bottle TEXT,p_patch JSONB,p_version BIGINT,p_actor TEXT,p_reason TEXT,p_action TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_before JSONB; v_after JSONB; v_name TEXT; v_version BIGINT;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-catalog-write',0));
 SELECT payload INTO v_before FROM bottle_contributions WHERE id=p_id AND updated_at=p_expected FOR UPDATE;
 IF v_before IS NULL THEN RAISE EXCEPTION 'admin_conflict'; END IF;
 IF p_action='save_later' THEN
  v_after=v_before || jsonb_build_object('reviewDraft',p_patch,'notes',p_reason,'updatedAt',now());
  UPDATE bottle_contributions SET payload=v_after,updated_at=now() WHERE id=p_id;
  INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES(p_actor,'bottle_submission_draft',p_id,jsonb_build_object('reason',p_reason,'before',v_before,'after',v_after));
  RETURN v_after;
 END IF;
 IF p_action<>'approve_changes' OR p_patch IS NULL OR p_bottle IS NULL THEN RAISE EXCEPTION 'invalid_review'; END IF;
 IF v_before->>'status' IN ('added','matched_existing') THEN RAISE EXCEPTION 'admin_conflict'; END IF;
 v_version=owner_save_bottle_record(p_bottle,p_patch,NULL,p_version,p_actor,p_reason,NULL);
 v_name=p_patch->>'canonicalName';
 RETURN owner_resolve_bottle_submission(p_id,p_expected,p_bottle,v_name,p_actor,p_reason,'added');
END $$;
