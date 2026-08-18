CREATE TABLE IF NOT EXISTS signal_point_accounts (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CONSTRAINT signal_point_accounts_balance_nonnegative CHECK (balance >= 0),
  debt INTEGER NOT NULL DEFAULT 0 CONSTRAINT signal_point_accounts_debt_nonnegative CHECK (debt >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE signal_point_accounts ADD COLUMN IF NOT EXISTS debt INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signal_point_accounts_debt_nonnegative' AND conrelid='signal_point_accounts'::regclass) THEN
    ALTER TABLE signal_point_accounts ADD CONSTRAINT signal_point_accounts_debt_nonnegative CHECK (debt >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS signal_point_reward_generations (
  user_id TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 0 CONSTRAINT signal_point_reward_generation_nonnegative CHECK (generation >= 0),
  reconciled_generation BIGINT NOT NULL DEFAULT -1 CONSTRAINT signal_point_reward_reconciled_generation_valid CHECK (reconciled_generation >= -1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION next_community_sighting_reward_generation(p_user_id TEXT)
RETURNS BIGINT LANGUAGE SQL AS $$
  INSERT INTO signal_point_reward_generations(user_id,generation)
  VALUES(p_user_id,1)
  ON CONFLICT(user_id) DO UPDATE SET generation=signal_point_reward_generations.generation+1,updated_at=NOW()
  RETURNING generation
$$;

CREATE TABLE IF NOT EXISTS signal_point_source_balances (
  user_id TEXT NOT NULL REFERENCES signal_point_accounts(user_id),
  source_key TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CONSTRAINT signal_point_source_balance_nonnegative CHECK (points >= 0),
  revision INTEGER NOT NULL DEFAULT 0 CONSTRAINT signal_point_source_balance_revision_nonnegative CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_key)
);
ALTER TABLE signal_point_source_balances ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signal_point_source_balance_revision_nonnegative' AND conrelid='signal_point_source_balances'::regclass) THEN
    ALTER TABLE signal_point_source_balances ADD CONSTRAINT signal_point_source_balance_revision_nonnegative CHECK (revision >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS signal_reward_catalog (
  item_key TEXT PRIMARY KEY,
  catalog_version INTEGER NOT NULL CONSTRAINT signal_reward_catalog_version_positive CHECK (catalog_version > 0),
  name TEXT NOT NULL,
  points_cost INTEGER NOT NULL CONSTRAINT signal_reward_catalog_cost_positive CHECK (points_cost > 0),
  fulfillment_type TEXT NOT NULL CONSTRAINT signal_reward_catalog_fulfillment_valid CHECK (fulfillment_type IN ('physical', 'digital')),
  inventory_remaining INTEGER CONSTRAINT signal_reward_catalog_inventory_nonnegative CHECK (inventory_remaining IS NULL OR inventory_remaining >= 0),
  option_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signal_reward_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES signal_point_accounts(user_id),
  idempotency_key TEXT NOT NULL,
  item_key TEXT NOT NULL REFERENCES signal_reward_catalog(item_key),
  catalog_version INTEGER NOT NULL,
  item_snapshot JSONB NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  points_spent INTEGER NOT NULL CONSTRAINT signal_reward_redemption_points_positive CHECK (points_spent > 0),
  status TEXT NOT NULL CONSTRAINT signal_reward_redemption_status_valid CHECK (status IN ('reserved','details_required','submitted','approved','packed','digital_fulfillment','shipped','delivered','canceled')),
  account_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at TIMESTAMPTZ,
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS signal_point_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES signal_point_accounts(user_id),
  idempotency_key TEXT NOT NULL,
  entry_kind TEXT NOT NULL CONSTRAINT signal_point_ledger_kind_valid CHECK (entry_kind IN ('credit','debit','migration_credit','migration_debit','redemption_debit','cancellation_credit')),
  points INTEGER NOT NULL CONSTRAINT signal_point_ledger_points_nonzero CHECK (points <> 0),
  balance_delta INTEGER NOT NULL,
  debt_delta INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_key TEXT,
  redemption_id TEXT REFERENCES signal_reward_redemptions(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

-- Roll-forward support for databases that received the pre-cutover draft: add the accounting
-- dimensions, populate existing append-only entries, and then enforce the stronger invariants.
DROP TRIGGER IF EXISTS signal_point_ledger_append_only ON signal_point_ledger;
ALTER TABLE signal_point_ledger ADD COLUMN IF NOT EXISTS balance_delta INTEGER;
ALTER TABLE signal_point_ledger ADD COLUMN IF NOT EXISTS debt_delta INTEGER;
UPDATE signal_point_ledger SET balance_delta=points WHERE balance_delta IS NULL;
UPDATE signal_point_ledger SET debt_delta=0 WHERE debt_delta IS NULL;
ALTER TABLE signal_point_ledger ALTER COLUMN balance_delta SET NOT NULL;
ALTER TABLE signal_point_ledger ALTER COLUMN debt_delta SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE signal_point_ledger DROP CONSTRAINT IF EXISTS signal_point_ledger_sign_matches_kind;
  ALTER TABLE signal_point_ledger ADD CONSTRAINT signal_point_ledger_sign_matches_kind CHECK (
    (entry_kind IN ('credit','migration_credit','cancellation_credit') AND points > 0 AND balance_delta >= 0 AND debt_delta <= 0)
    OR (entry_kind IN ('debit','migration_debit','redemption_debit') AND points < 0 AND balance_delta <= 0 AND debt_delta >= 0)
  );
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signal_point_ledger_economic_balance' AND conrelid='signal_point_ledger'::regclass) THEN
    ALTER TABLE signal_point_ledger ADD CONSTRAINT signal_point_ledger_economic_balance CHECK (points = balance_delta - debt_delta);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reject_signal_reward_fulfillment_snapshot_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.redemption_id IS DISTINCT FROM OLD.redemption_id
    OR NEW.fulfillment_type IS DISTINCT FROM OLD.fulfillment_type
    OR NEW.shipping_profile_user_id IS DISTINCT FROM OLD.shipping_profile_user_id
    OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address THEN
    RAISE EXCEPTION 'Signal reward fulfillment snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TABLE IF NOT EXISTS signal_reward_redemption_events (
  id BIGSERIAL PRIMARY KEY,
  redemption_id TEXT NOT NULL REFERENCES signal_reward_redemptions(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CONSTRAINT signal_reward_event_actor_role_valid CHECK (actor_role IN ('member','owner','system')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signal_reward_fulfillments (
  redemption_id TEXT PRIMARY KEY REFERENCES signal_reward_redemptions(id),
  fulfillment_type TEXT NOT NULL CONSTRAINT signal_reward_fulfillment_type_valid CHECK (fulfillment_type IN ('physical','digital')),
  shipping_profile_user_id TEXT,
  shipping_address JSONB,
  owner_notes TEXT,
  carrier TEXT,
  tracking_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE signal_reward_fulfillments ADD COLUMN IF NOT EXISTS shipping_address JSONB;
UPDATE signal_reward_fulfillments fulfillments SET shipping_address=jsonb_build_object(
  'recipientName',shipping.recipient_name,'addressLine1',shipping.address_line1,'addressLine2',shipping.address_line2,
  'city',shipping.city,'stateCode',TRIM(shipping.state_code),'postalCode',shipping.postal_code,
  'countryCode',TRIM(shipping.country_code),'phone',shipping.phone
)
FROM founder_glass_shipping shipping
WHERE fulfillments.fulfillment_type='physical' AND fulfillments.shipping_address IS NULL
  AND shipping.user_id=fulfillments.shipping_profile_user_id;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM signal_reward_fulfillments WHERE fulfillment_type='physical' AND shipping_address IS NULL) THEN
    RAISE EXCEPTION 'Signal Points roll-forward requires a shipping snapshot for every existing physical fulfillment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signal_reward_fulfillment_shipping_snapshot_valid' AND conrelid='signal_reward_fulfillments'::regclass) THEN
    ALTER TABLE signal_reward_fulfillments ADD CONSTRAINT signal_reward_fulfillment_shipping_snapshot_valid CHECK (
      (fulfillment_type='digital' AND shipping_address IS NULL)
      OR (fulfillment_type='physical' AND jsonb_typeof(shipping_address)='object'
        AND shipping_address ?& ARRAY['recipientName','addressLine1','addressLine2','city','stateCode','postalCode','countryCode','phone']
        AND COALESCE(TRIM(shipping_address->>'recipientName'),'')<>'' AND COALESCE(TRIM(shipping_address->>'addressLine1'),'')<>''
        AND COALESCE(TRIM(shipping_address->>'city'),'')<>'' AND COALESCE(shipping_address->>'stateCode','') ~ '^[A-Z]{2}$'
        AND COALESCE(TRIM(shipping_address->>'postalCode'),'')<>'' AND COALESCE(shipping_address->>'countryCode','')='US'
        AND COALESCE(TRIM(shipping_address->>'phone'),'')<>'')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signal_reward_fulfillment_tracking_pair' AND conrelid='signal_reward_fulfillments'::regclass) THEN
    ALTER TABLE signal_reward_fulfillments ADD CONSTRAINT signal_reward_fulfillment_tracking_pair CHECK (
      (carrier IS NULL AND tracking_number IS NULL)
      OR (carrier IS NOT NULL AND tracking_number IS NOT NULL AND TRIM(carrier)<>'' AND TRIM(tracking_number)<>'')
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS signal_reward_fulfillments_immutable_snapshot ON signal_reward_fulfillments;
CREATE TRIGGER signal_reward_fulfillments_immutable_snapshot BEFORE UPDATE ON signal_reward_fulfillments
FOR EACH ROW EXECUTE FUNCTION reject_signal_reward_fulfillment_snapshot_mutation();

CREATE TABLE IF NOT EXISTS signal_point_migrations (
  migration_key TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
-- A successful two-pass Clerk backfill writes the verified-complete marker.
-- Installing this schema must never create that marker.

INSERT INTO signal_reward_catalog (item_key,catalog_version,name,points_cost,fulfillment_type,option_snapshot)
VALUES
  ('sticker_pack',1,'Bourbon Signal sticker pack',75,'physical','{"usShippingIncluded":true}'::jsonb),
  ('rocks_glass',1,'Bourbon Signal rocks glass',400,'physical','{"usShippingIncluded":true,"glassQuantity":1,"engravingPointsPerGlass":125}'::jsonb),
  ('glencairn',1,'Bourbon Signal Glencairn',450,'physical','{"usShippingIncluded":true,"glassQuantity":1,"engravingPointsPerGlass":125}'::jsonb),
  ('bourbon_shipping_gift_card_100',2,'$100 Caskers gift card',2600,'digital','{"ownerFulfillment":true,"requiresAge21Attestation":true,"denominationUsd":100,"partner":"Caskers"}'::jsonb)
ON CONFLICT (item_key) DO UPDATE SET
  catalog_version=EXCLUDED.catalog_version,name=EXCLUDED.name,points_cost=EXCLUDED.points_cost,
  fulfillment_type=EXCLUDED.fulfillment_type,option_snapshot=EXCLUDED.option_snapshot,updated_at=NOW()
WHERE signal_reward_catalog.catalog_version < EXCLUDED.catalog_version;

-- Preserve the retired SKU for immutable historical redemption foreign keys and snapshots.
UPDATE signal_reward_catalog SET active=FALSE,updated_at=NOW()
WHERE item_key='bourbon_shipping_gift_card_25' AND active=TRUE;

-- Retain historical rows for immutable redemption snapshots, but keep the live catalog focused.
UPDATE signal_reward_catalog SET active=FALSE,updated_at=NOW()
WHERE item_key IN ('coaster_set','tshirt','rocks_glass_pair','glencairn_pair','hoodie') AND active=TRUE;

CREATE OR REPLACE FUNCTION reject_signal_point_ledger_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Signal Points ledger is append-only'; END $$;
DROP TRIGGER IF EXISTS signal_point_ledger_append_only ON signal_point_ledger;
CREATE TRIGGER signal_point_ledger_append_only BEFORE UPDATE OR DELETE ON signal_point_ledger
FOR EACH ROW EXECUTE FUNCTION reject_signal_point_ledger_mutation();

CREATE OR REPLACE FUNCTION credit_signal_points(p_user_id TEXT,p_points INTEGER,p_idempotency_key TEXT,p_source_type TEXT,p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE current_balance INTEGER; current_debt INTEGER; debt_repaid INTEGER; spendable_added INTEGER; existing_row signal_point_ledger%ROWTYPE;
BEGIN
  IF p_points <= 0 THEN RAISE EXCEPTION 'Signal Points credit must be positive'; END IF;
  INSERT INTO signal_point_accounts(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT balance,debt INTO current_balance,current_debt FROM signal_point_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO existing_row FROM signal_point_ledger WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF existing_row.entry_kind<>'credit' OR existing_row.points<>p_points OR existing_row.source_type<>p_source_type
      OR existing_row.metadata->'creditRequest' IS DISTINCT FROM jsonb_build_object(
        'points',p_points,'sourceType',p_source_type,'metadata',COALESCE(p_metadata,'{}'::jsonb)) THEN
      RAISE EXCEPTION 'Signal Points credit idempotency key conflict';
    END IF;
    RETURN current_balance;
  END IF;
  debt_repaid := LEAST(current_debt,p_points);
  spendable_added := p_points-debt_repaid;
  INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,metadata)
  VALUES(p_user_id,p_idempotency_key,'credit',p_points,spendable_added,-debt_repaid,p_source_type,
    COALESCE(p_metadata,'{}'::jsonb)||jsonb_build_object('debtRepaid',debt_repaid,'spendableAdded',spendable_added,
      'creditRequest',jsonb_build_object('points',p_points,'sourceType',p_source_type,'metadata',COALESCE(p_metadata,'{}'::jsonb))))
  ON CONFLICT(user_id,idempotency_key) DO NOTHING;
  IF FOUND THEN
    UPDATE signal_point_accounts SET balance=balance+spendable_added,debt=debt-debt_repaid,updated_at=NOW()
    WHERE user_id=p_user_id RETURNING balance INTO current_balance;
  END IF;
  RETURN current_balance;
END $$;

CREATE OR REPLACE FUNCTION reconcile_signal_point_source(p_user_id TEXT,p_source_key TEXT,p_target_points INTEGER,p_idempotency_key TEXT,p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE previous_points INTEGER; previous_revision INTEGER; delta INTEGER; current_balance INTEGER; current_debt INTEGER;
  ledger_key TEXT; applied_balance_delta INTEGER; applied_debt_delta INTEGER; debt_repaid INTEGER; debt_created INTEGER;
BEGIN
  IF p_target_points < 0 THEN RAISE EXCEPTION 'Signal Points source target cannot be negative'; END IF;
  INSERT INTO signal_point_accounts(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT balance,debt INTO current_balance,current_debt FROM signal_point_accounts WHERE user_id=p_user_id FOR UPDATE;
  INSERT INTO signal_point_source_balances(user_id,source_key,points) VALUES(p_user_id,p_source_key,0) ON CONFLICT(user_id,source_key) DO NOTHING;
  SELECT points,revision INTO previous_points,previous_revision FROM signal_point_source_balances WHERE user_id=p_user_id AND source_key=p_source_key FOR UPDATE;
  delta := p_target_points-previous_points;
  IF delta <> 0 THEN
    IF delta > 0 THEN
      debt_repaid := LEAST(current_debt,delta); debt_created := 0;
      applied_balance_delta := delta-debt_repaid; applied_debt_delta := -debt_repaid;
    ELSE
      applied_balance_delta := -LEAST(current_balance,-delta);
      debt_created := (-delta)+applied_balance_delta; debt_repaid := 0;
      applied_debt_delta := debt_created;
    END IF;
    ledger_key := p_idempotency_key||':source:'||p_source_key||':revision:'||(previous_revision+1)::TEXT;
    INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,source_key,metadata)
    VALUES(p_user_id,ledger_key,CASE WHEN delta > 0 THEN 'migration_credit' ELSE 'migration_debit' END,delta,
      applied_balance_delta,applied_debt_delta,'clerk_metadata',p_source_key,
      COALESCE(p_metadata,'{}'::jsonb)||jsonb_build_object('previousPoints',previous_points,'targetPoints',p_target_points,
        'debtRepaid',debt_repaid,'debtCreated',debt_created,'spendableDelta',applied_balance_delta))
    ON CONFLICT(user_id,idempotency_key) DO NOTHING;
    IF FOUND THEN
      UPDATE signal_point_accounts SET balance=balance+applied_balance_delta,debt=debt+applied_debt_delta,updated_at=NOW()
      WHERE user_id=p_user_id RETURNING balance,debt INTO current_balance,current_debt;
      UPDATE signal_point_source_balances SET points=p_target_points,revision=previous_revision+1,updated_at=NOW() WHERE user_id=p_user_id AND source_key=p_source_key;
    END IF;
  END IF;
  RETURN current_balance;
END $$;

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
      COALESCE(p_metadata,'{}'::jsonb)||jsonb_build_object('generation',p_generation,'omittedFromSourceSet',TRUE));
  END LOOP;

  FOR target IN
    SELECT item->>'sourceKey' AS source_key,(item->>'targetPoints')::INTEGER AS target_points,
      CASE WHEN jsonb_typeof(item->'metadata')='object' THEN item->'metadata' ELSE '{}'::jsonb END AS metadata
    FROM jsonb_array_elements(p_targets) item
    ORDER BY CASE WHEN item->>'sourceKey'=p_source_prefix||':remainder' THEN 2 WHEN item->>'sourceKey'=p_source_prefix THEN 1 ELSE 0 END,
      item->>'sourceKey'
  LOOP
    PERFORM reconcile_signal_point_source(p_user_id,target.source_key,target.target_points,p_idempotency_key,
      COALESCE(p_metadata,'{}'::jsonb)||target.metadata||jsonb_build_object('generation',p_generation,'targetPoints',target.target_points));
  END LOOP;

  UPDATE signal_point_reward_generations SET reconciled_generation=p_generation,updated_at=NOW() WHERE user_id=p_user_id;
  SELECT * INTO account_row FROM signal_point_accounts WHERE user_id=p_user_id;
  RETURN QUERY SELECT account_row.balance,account_row.debt,TRUE,p_generation;
END $$;

-- Remove the seven-argument pre-cutover draft so roll-forward cannot leave an unsafe overload callable.
DROP FUNCTION IF EXISTS reserve_signal_reward(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT);
CREATE OR REPLACE FUNCTION reserve_signal_reward(p_redemption_id TEXT,p_user_id TEXT,p_tier TEXT,p_item_key TEXT,p_idempotency_key TEXT,p_details JSONB,p_account_email TEXT,p_shipping_confirmed BOOLEAN)
RETURNS TABLE(redemption_id TEXT,redemption_status TEXT,balance INTEGER) LANGUAGE plpgsql AS $$
DECLARE account_row signal_point_accounts%ROWTYPE; catalog_row signal_reward_catalog%ROWTYPE; existing_row signal_reward_redemptions%ROWTYPE;
  total_cost INTEGER; glass_count INTEGER; shipping_snapshot JSONB;
BEGIN
  IF p_tier NOT IN ('standard','barrel','bottled-in-bond') THEN RAISE EXCEPTION 'Paid membership required'; END IF;
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

CREATE OR REPLACE FUNCTION transition_signal_reward_redemption(p_redemption_id TEXT,p_actor_id TEXT,p_next_status TEXT,p_actor_role TEXT,p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS TABLE(redemption_id TEXT,redemption_status TEXT,balance INTEGER) LANGUAGE plpgsql AS $$
DECLARE redemption_row signal_reward_redemptions%ROWTYPE; current_balance INTEGER; current_debt INTEGER; legal BOOLEAN; restored INTEGER;
  debt_repaid INTEGER; spendable_added INTEGER; shipment_carrier TEXT; shipment_tracking TEXT;
BEGIN
  SELECT * INTO redemption_row FROM signal_reward_redemptions WHERE id=p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found'; END IF;
  IF p_actor_role='member' AND redemption_row.user_id<>p_actor_id THEN RAISE EXCEPTION 'Redemption owner mismatch'; END IF;
  SELECT signal_point_accounts.balance,signal_point_accounts.debt INTO current_balance,current_debt FROM signal_point_accounts WHERE user_id=redemption_row.user_id FOR UPDATE;
  IF redemption_row.status=p_next_status THEN RETURN QUERY SELECT redemption_row.id,redemption_row.status,current_balance; RETURN; END IF;
  legal := CASE redemption_row.status
    WHEN 'reserved' THEN p_next_status IN ('details_required','submitted','canceled')
    WHEN 'details_required' THEN p_next_status IN ('submitted','canceled')
    WHEN 'submitted' THEN p_next_status IN ('approved','canceled')
    WHEN 'approved' THEN p_next_status IN ('packed','digital_fulfillment','canceled')
    WHEN 'packed' THEN p_next_status='shipped'
    WHEN 'digital_fulfillment' THEN p_next_status='delivered'
    WHEN 'shipped' THEN p_next_status='delivered'
    ELSE FALSE END;
  IF NOT legal THEN RAISE EXCEPTION 'Invalid redemption transition: % to %',redemption_row.status,p_next_status; END IF;
  IF redemption_row.status='approved' AND p_next_status='packed' AND redemption_row.item_snapshot->>'fulfillmentType'<>'physical' THEN RAISE EXCEPTION 'Digital rewards cannot be packed'; END IF;
  IF redemption_row.status='approved' AND p_next_status='digital_fulfillment' AND redemption_row.item_snapshot->>'fulfillmentType'<>'digital' THEN RAISE EXCEPTION 'Physical rewards require packing'; END IF;
  IF p_next_status='shipped' THEN
    shipment_carrier := TRIM(COALESCE(p_metadata->>'carrier',''));
    shipment_tracking := TRIM(COALESCE(p_metadata->>'trackingNumber',''));
    IF shipment_carrier='' OR shipment_tracking='' THEN RAISE EXCEPTION 'Carrier and tracking data are required before shipped'; END IF;
    UPDATE signal_reward_fulfillments AS fulfillments
    SET carrier=shipment_carrier,tracking_number=shipment_tracking,updated_at=NOW()
    WHERE fulfillments.redemption_id=redemption_row.id AND fulfillments.fulfillment_type='physical';
    IF NOT FOUND THEN RAISE EXCEPTION 'Physical fulfillment not found'; END IF;
  END IF;
  IF p_next_status='canceled' THEN
    restored := 0;
    debt_repaid := LEAST(current_debt,redemption_row.points_spent);
    spendable_added := redemption_row.points_spent-debt_repaid;
    INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,source_key,redemption_id,metadata)
    VALUES(redemption_row.user_id,'cancellation:'||redemption_row.id,'cancellation_credit',redemption_row.points_spent,
      spendable_added,-debt_repaid,'redemption_cancellation',redemption_row.item_key,redemption_row.id,
      COALESCE(p_metadata,'{}'::jsonb)||jsonb_build_object('debtRepaid',debt_repaid,'spendableAdded',spendable_added))
    ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING points INTO restored;
    IF COALESCE(restored,0)>0 THEN
      UPDATE signal_point_accounts SET balance=signal_point_accounts.balance+spendable_added,debt=signal_point_accounts.debt-debt_repaid,updated_at=NOW()
      WHERE user_id=redemption_row.user_id RETURNING signal_point_accounts.balance INTO current_balance;
      UPDATE signal_reward_catalog SET inventory_remaining=CASE WHEN inventory_remaining IS NULL THEN NULL ELSE inventory_remaining+1 END,updated_at=NOW() WHERE item_key=redemption_row.item_key;
    END IF;
  END IF;
  UPDATE signal_reward_redemptions SET status=p_next_status,updated_at=NOW(),canceled_at=CASE WHEN p_next_status='canceled' THEN NOW() ELSE canceled_at END WHERE id=p_redemption_id;
  INSERT INTO signal_reward_redemption_events(redemption_id,from_status,to_status,actor_id,actor_role,metadata) VALUES(redemption_row.id,redemption_row.status,p_next_status,p_actor_id,p_actor_role,COALESCE(p_metadata,'{}'::jsonb));
  RETURN QUERY SELECT redemption_row.id,p_next_status,current_balance;
END $$;

DO $$
BEGIN
  IF to_regclass('member_referral_point_ledger') IS NOT NULL THEN
    INSERT INTO signal_point_accounts(user_id) SELECT DISTINCT referrer_user_id FROM member_referral_point_ledger ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,source_key,metadata)
    SELECT referrer_user_id,'referral-ledger:'||id,'credit',points,points,0,'referral',referred_user_id,jsonb_build_object('legacyReferralLedgerId',id)
    FROM member_referral_point_ledger ON CONFLICT(user_id,idempotency_key) DO NOTHING;
    INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,source_key,metadata)
    SELECT imported.user_id,'referral-ledger-adjustment-9x:'||referrals.id,'migration_credit',imported.points*9,imported.points*9,0,
      'referral_adjustment',imported.source_key,jsonb_build_object('legacyReferralLedgerId',referrals.id,'adjustmentMultiple',9,'reason','pre_cutover_1x_referral_import')
    FROM signal_point_ledger imported
    JOIN member_referral_point_ledger referrals ON imported.metadata->>'legacyReferralLedgerId'=referrals.id::TEXT
    WHERE imported.idempotency_key='referral-ledger:'||referrals.id
      AND imported.entry_kind='credit' AND imported.points*10=referrals.points
    ON CONFLICT(user_id,idempotency_key) DO NOTHING;
    UPDATE signal_point_accounts accounts SET
      balance=GREATEST((SELECT COALESCE(SUM(points),0)::INTEGER FROM signal_point_ledger ledger WHERE ledger.user_id=accounts.user_id),0),
      debt=GREATEST(-(SELECT COALESCE(SUM(points),0)::INTEGER FROM signal_point_ledger ledger WHERE ledger.user_id=accounts.user_id),0),updated_at=NOW()
    WHERE EXISTS(SELECT 1 FROM member_referral_point_ledger referrals WHERE referrals.referrer_user_id=accounts.user_id);
  END IF;
  INSERT INTO signal_point_migrations(migration_key,details) VALUES('signal_points_clerk_metadata_v1_required','{"mode":"explicit-backfill-required-before-cutover"}'::jsonb) ON CONFLICT(migration_key) DO NOTHING;
  -- signal_points_clerk_metadata_v1_verified_complete is intentionally written only after the verified two-pass backfill.
  INSERT INTO signal_point_migrations(migration_key,details) VALUES('signal_points_debt_fulfillment_v2','{"rollForwardOnly":true}'::jsonb) ON CONFLICT(migration_key) DO NOTHING;
  INSERT INTO signal_point_migrations(migration_key,details) VALUES('signal_points_referral_ledger_10x_adjustment_v1','{"mode":"append-only-9x-adjustment"}'::jsonb) ON CONFLICT(migration_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION mirror_referral_signal_points() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO signal_point_accounts(user_id) VALUES(NEW.referrer_user_id) ON CONFLICT(user_id) DO NOTHING;
  PERFORM credit_signal_points(NEW.referrer_user_id,NEW.points,'referral-ledger:'||NEW.id,'referral',jsonb_build_object('referredUserId',NEW.referred_user_id,'tier',NEW.tier));
  RETURN NEW;
END $$;
DO $$ BEGIN
  IF to_regclass('member_referral_point_ledger') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS member_referral_signal_points_mirror ON member_referral_point_ledger;
    CREATE TRIGGER member_referral_signal_points_mirror AFTER INSERT ON member_referral_point_ledger FOR EACH ROW EXECUTE FUNCTION mirror_referral_signal_points();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS signal_point_ledger_user_created_idx ON signal_point_ledger(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS signal_reward_redemptions_user_created_idx ON signal_reward_redemptions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS signal_reward_redemptions_status_created_idx ON signal_reward_redemptions(status,created_at ASC);
