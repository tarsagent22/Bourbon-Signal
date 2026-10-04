-- Roll forward only. Codes are encrypted before import. Plaintext never reaches SQL.
CREATE TABLE IF NOT EXISTS signal_membership_offer_codes (
 id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, batch_id TEXT NOT NULL,
 tier TEXT NOT NULL CHECK(tier IN ('standard','barrel')),
 audience TEXT NOT NULL CHECK(audience IN ('free','member')),
 environment TEXT NOT NULL CHECK(environment IN ('PRODUCTION','SANDBOX')),
 code_hash TEXT NOT NULL UNIQUE, encrypted_code TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, claimed_at TIMESTAMPTZ,
 redemption_id TEXT UNIQUE REFERENCES signal_reward_redemptions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS signal_membership_offer_codes_available ON signal_membership_offer_codes(tier,audience,environment,expires_at) WHERE claimed_at IS NULL;
CREATE OR REPLACE FUNCTION reserve_signal_reward(p_redemption_id TEXT,p_user_id TEXT,p_tier TEXT,p_item_key TEXT,p_idempotency_key TEXT,p_details JSONB,p_account_email TEXT,p_shipping_confirmed BOOLEAN)
RETURNS TABLE(redemption_id TEXT,redemption_status TEXT,balance INTEGER) LANGUAGE plpgsql AS $$
DECLARE account_row signal_point_accounts%ROWTYPE; catalog_row signal_reward_catalog%ROWTYPE; existing_row signal_reward_redemptions%ROWTYPE;
  total_cost INTEGER; glass_count INTEGER; shipping_snapshot JSONB;
BEGIN
  IF p_tier NOT IN ('standard','barrel','bottled-in-bond') AND NOT (p_tier='free' AND p_item_key='standard_membership_credit_month') THEN RAISE EXCEPTION 'Paid membership required'; END IF;
  SELECT * INTO account_row FROM signal_point_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signal Points account is unavailable'; END IF;
  SELECT * INTO existing_row FROM signal_reward_redemptions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF existing_row.item_key<>p_item_key OR existing_row.details IS DISTINCT FROM COALESCE(p_details,'{}'::jsonb)
      OR LOWER(existing_row.account_email)<>LOWER(TRIM(p_account_email)) THEN
      RAISE EXCEPTION 'Redemption idempotency key conflict';
    END IF;
    RETURN QUERY SELECT existing_row.id,existing_row.status,account_row.balance; RETURN;
  END IF;
  SELECT * INTO catalog_row FROM signal_reward_catalog WHERE item_key=p_item_key AND active=TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward is unavailable'; END IF;
  IF p_item_key IN ('standard_membership_credit_month','barrel_membership_credit_month') THEN
    IF (p_item_key='standard_membership_credit_month' AND p_tier NOT IN ('free','standard'))
      OR (p_item_key='barrel_membership_credit_month' AND p_tier<>'barrel') THEN
      RAISE EXCEPTION 'Membership credit tier mismatch';
    END IF;
    SELECT * INTO existing_row FROM signal_reward_redemptions
    WHERE user_id=p_user_id
      AND item_key IN ('standard_membership_credit_month','barrel_membership_credit_month')
      AND status<>'canceled'
      AND created_at > NOW() - INTERVAL '1 year'
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      IF existing_row.item_key=p_item_key AND existing_row.details=COALESCE(p_details,'{}'::jsonb) AND existing_row.status IN ('submitted','approved','digital_fulfillment') THEN
        RETURN QUERY SELECT existing_row.id,existing_row.status,account_row.balance; RETURN;
      END IF;
      RAISE EXCEPTION 'Membership credit already redeemed within the last 12 months';
    END IF;
  END IF;
  glass_count := COALESCE((catalog_row.option_snapshot->>'glassQuantity')::INTEGER,0);
  total_cost := catalog_row.points_cost + CASE WHEN p_details->>'glassStyle'='personal' THEN glass_count*125 ELSE 0 END;
  IF account_row.balance < total_cost THEN RAISE EXCEPTION 'Not enough Signal Points'; END IF;
  IF NOT (catalog_row.inventory_remaining IS NULL OR catalog_row.inventory_remaining > 0) THEN RAISE EXCEPTION 'Reward is out of stock'; END IF;
  IF catalog_row.fulfillment_type='physical' THEN
    IF p_shipping_confirmed IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the saved U.S. shipping address'; END IF;
    SELECT jsonb_build_object('recipientName',recipient_name,'addressLine1',address_line1,'addressLine2',address_line2,
      'city',city,'stateCode',TRIM(state_code),'postalCode',postal_code,'countryCode',TRIM(country_code),'phone',phone)
    INTO shipping_snapshot FROM founder_glass_shipping
    WHERE user_id=p_user_id AND country_code='US' AND TRIM(recipient_name)<>'' AND TRIM(address_line1)<>''
      AND TRIM(city)<>'' AND TRIM(state_code) ~ '^[A-Z]{2}$' AND TRIM(postal_code)<>'' AND TRIM(phone)<>''
    FOR SHARE;
    IF shipping_snapshot IS NULL THEN RAISE EXCEPTION 'A complete U.S. shipping address is required'; END IF;
  END IF;
  UPDATE signal_reward_catalog SET inventory_remaining=CASE WHEN inventory_remaining IS NULL THEN NULL ELSE inventory_remaining-1 END,updated_at=NOW() WHERE item_key=p_item_key;
  INSERT INTO signal_reward_redemptions(id,user_id,idempotency_key,item_key,catalog_version,item_snapshot,details,points_spent,status,account_email)
  VALUES(p_redemption_id,p_user_id,p_idempotency_key,p_item_key,catalog_row.catalog_version,jsonb_build_object('itemKey',catalog_row.item_key,'name',catalog_row.name,'basePoints',catalog_row.points_cost,'catalogVersion',catalog_row.catalog_version,'fulfillmentType',catalog_row.fulfillment_type,'options',catalog_row.option_snapshot),COALESCE(p_details,'{}'::jsonb),total_cost,'submitted',p_account_email);
  INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,source_key,redemption_id,metadata)
  VALUES(p_user_id,'redemption:'||p_redemption_id,'redemption_debit',-total_cost,-total_cost,0,'redemption',p_item_key,p_redemption_id,'{}'::jsonb);
  UPDATE signal_point_accounts SET balance=signal_point_accounts.balance-total_cost,updated_at=NOW() WHERE user_id=p_user_id RETURNING signal_point_accounts.balance INTO account_row.balance;
  INSERT INTO signal_reward_fulfillments(redemption_id,fulfillment_type,shipping_profile_user_id,shipping_address)
  VALUES(p_redemption_id,catalog_row.fulfillment_type,CASE WHEN catalog_row.fulfillment_type='physical' THEN p_user_id ELSE NULL END,shipping_snapshot);
  INSERT INTO signal_reward_redemption_events(redemption_id,from_status,to_status,actor_id,actor_role) VALUES(p_redemption_id,NULL,'submitted',p_user_id,'member');
  RETURN QUERY SELECT p_redemption_id,'submitted'::TEXT,account_row.balance;
END $$;

CREATE OR REPLACE FUNCTION complete_signal_membership_credit_fulfillment(p_redemption_id TEXT,p_actor_id TEXT,p_provider_reference TEXT,p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS TABLE(redemption_id TEXT,redemption_status TEXT,balance INTEGER) LANGUAGE plpgsql AS $$
DECLARE redemption_row signal_reward_redemptions%ROWTYPE; fulfillment_row signal_reward_fulfillments%ROWTYPE; account_balance INTEGER; expected_note TEXT;
BEGIN
  IF COALESCE(TRIM(p_provider_reference),'')='' THEN RAISE EXCEPTION 'Membership credit provider reference is required'; END IF;
  expected_note := CASE COALESCE(p_metadata->>'provider','stripe') WHEN 'apple' THEN 'Apple offer: ' WHEN 'earned_access' THEN 'Earned access: ' ELSE 'Stripe credit: ' END ||TRIM(p_provider_reference);
  SELECT * INTO redemption_row FROM signal_reward_redemptions WHERE id=p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found'; END IF;
  IF redemption_row.item_key NOT IN ('standard_membership_credit_month','barrel_membership_credit_month') THEN RAISE EXCEPTION 'Membership credit redemption required'; END IF;
  SELECT * INTO fulfillment_row FROM signal_reward_fulfillments WHERE signal_reward_fulfillments.redemption_id=p_redemption_id FOR UPDATE;
  IF NOT FOUND OR fulfillment_row.fulfillment_type<>'digital' THEN RAISE EXCEPTION 'Digital membership credit fulfillment is unavailable'; END IF;
  IF COALESCE(fulfillment_row.owner_notes,'')<>'' AND fulfillment_row.owner_notes<>expected_note THEN RAISE EXCEPTION 'Membership credit provider reference conflict'; END IF;
  IF redemption_row.status='delivered' THEN
    SELECT signal_point_accounts.balance INTO account_balance FROM signal_point_accounts WHERE user_id=redemption_row.user_id;
    RETURN QUERY SELECT redemption_row.id,redemption_row.status,account_balance; RETURN;
  END IF;
  IF redemption_row.status<>'digital_fulfillment' THEN RAISE EXCEPTION 'Membership credit is not ready for completion'; END IF;
  UPDATE signal_reward_fulfillments SET owner_notes=expected_note,updated_at=NOW() WHERE signal_reward_fulfillments.redemption_id=p_redemption_id;
  PERFORM transition_signal_reward_redemption(redemption_row.id,p_actor_id,'delivered','system',(COALESCE(p_metadata,'{}'::jsonb)-'rewardSnapshot')||jsonb_build_object('provider',COALESCE(p_metadata->>'provider','stripe'),'providerReference',TRIM(p_provider_reference)));
  SELECT signal_point_accounts.balance INTO account_balance FROM signal_point_accounts WHERE user_id=redemption_row.user_id;
  RETURN QUERY SELECT redemption_row.id,'delivered'::TEXT,account_balance;
END $$;


CREATE OR REPLACE FUNCTION redeem_signal_membership_month(p_id TEXT,p_user TEXT,p_tier TEXT,p_item TEXT,p_key TEXT,p_email TEXT,p_provider TEXT,p_audience TEXT)
RETURNS TABLE(redemption_id TEXT,redemption_status TEXT,balance INTEGER) LANGUAGE plpgsql AS $$
DECLARE result RECORD; code_row signal_membership_offer_codes%ROWTYPE; details_json JSONB;
BEGIN
 IF p_item NOT IN ('standard_membership_credit_month','barrel_membership_credit_month') OR p_provider NOT IN ('apple','earned_access','stripe') THEN RAISE EXCEPTION 'Invalid membership month'; END IF;
 IF p_audience NOT IN ('free','member') OR (p_audience='free') IS DISTINCT FROM (p_tier='free') THEN RAISE EXCEPTION 'Membership month audience mismatch'; END IF;
 IF p_provider='earned_access' AND (p_tier<>'free' OR p_item<>'standard_membership_credit_month') THEN RAISE EXCEPTION 'Free Standard month required'; END IF;
 details_json := jsonb_build_object('monthProvider',p_provider,'monthAudience',p_audience);
 SELECT details INTO details_json FROM signal_reward_redemptions WHERE user_id=p_user AND idempotency_key=p_key AND item_key=p_item AND ((details->>'monthProvider'=p_provider AND details->>'monthAudience'=p_audience) OR (p_provider='stripe' AND details='{}'::jsonb));
 IF NOT FOUND THEN details_json := jsonb_build_object('monthProvider',p_provider,'monthAudience',p_audience); END IF;
 SELECT * INTO result FROM reserve_signal_reward(p_id,p_user,p_tier,p_item,p_key,details_json,p_email,TRUE);
 IF result.redemption_status='delivered' THEN RETURN QUERY SELECT result.redemption_id,result.redemption_status,result.balance; RETURN; END IF;
 IF p_provider='stripe' THEN RETURN QUERY SELECT result.redemption_id,result.redemption_status,result.balance; RETURN; END IF;
 IF p_provider='apple' THEN
   SELECT * INTO code_row FROM signal_membership_offer_codes c WHERE c.redemption_id=result.redemption_id FOR UPDATE;
   IF NOT FOUND THEN
     SELECT * INTO code_row FROM signal_membership_offer_codes
       WHERE tier=CASE p_item WHEN 'standard_membership_credit_month' THEN 'standard' ELSE 'barrel' END
         AND audience=p_audience AND environment='PRODUCTION' AND claimed_at IS NULL
         AND expires_at>NOW()+INTERVAL '1 day' ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
     IF NOT FOUND THEN RAISE EXCEPTION 'Apple membership reward codes are unavailable'; END IF;
     UPDATE signal_membership_offer_codes SET redemption_id=result.redemption_id,claimed_at=NOW() WHERE id=code_row.id;
   END IF;
 ELSE
   UPDATE signal_reward_redemptions SET details=details || jsonb_build_object('accessStartsAt',NOW(),'accessExpiresAt',NOW()+INTERVAL '1 month') WHERE id=result.redemption_id;
 END IF;
 PERFORM prepare_signal_membership_credit_fulfillment(result.redemption_id,p_user,jsonb_build_object('provider',p_provider));
 RETURN QUERY SELECT * FROM complete_signal_membership_credit_fulfillment(result.redemption_id,p_user,COALESCE(code_row.id,result.redemption_id),jsonb_build_object('provider',p_provider));
END $$;
INSERT INTO signal_point_migrations(migration_key,details) VALUES('signal_points_membership_month_v5_ready','{"providers":["stripe","earned_access","apple"],"appleRequiresProductionCodes":true}'::jsonb) ON CONFLICT DO NOTHING;
