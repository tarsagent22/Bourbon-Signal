CREATE TABLE IF NOT EXISTS gift_orders (
  id TEXT PRIMARY KEY,
  purchaser_request_id TEXT NOT NULL,
  purchaser_user_id TEXT NOT NULL,
  purchaser_email TEXT NOT NULL,
  purchaser_name TEXT,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  gift_message TEXT,
  gift_plan TEXT NOT NULL CONSTRAINT gift_orders_plan_valid CHECK (gift_plan IN ('standard_annual_gift', 'barrel_annual_gift', 'founder_lifetime_gift')),
  gift_tier TEXT NOT NULL CONSTRAINT gift_orders_tier_valid CHECK (gift_tier IN ('standard', 'barrel', 'bottled-in-bond')),
  delivery_mode TEXT NOT NULL CONSTRAINT gift_orders_delivery_mode_valid CHECK (delivery_mode IN ('now', 'scheduled')),
  scheduled_local_datetime TEXT,
  delivery_timezone TEXT,
  scheduled_delivery_at TIMESTAMPTZ,
  payment_status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT gift_orders_payment_status_valid CHECK (payment_status IN ('pending', 'checkout_open', 'funded', 'failed', 'expired', 'refunded', 'disputed')),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT UNIQUE,
  redemption_token_hash TEXT UNIQUE,
  redemption_token_key_version TEXT,
  entitlement_version TEXT,
  redeemed_by_user_id TEXT,
  redeemed_by_email TEXT,
  redeemed_at TIMESTAMPTZ,
  checkout_claim_token TEXT,
  checkout_claimed_at TIMESTAMPTZ,
  checkout_attempt INTEGER NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL DEFAULT 'waiting' CONSTRAINT gift_orders_delivery_status_valid CHECK (delivery_status IN ('waiting', 'due', 'claimed', 'sending', 'delivered', 'failed', 'suppressed')),
  delivery_claimed_at TIMESTAMPTZ,
  delivery_claim_token TEXT,
  delivery_idempotency_key TEXT,
  delivery_provider_message_id TEXT,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  access_starts_at TIMESTAMPTZ,
  access_expires_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  dispute_status TEXT CONSTRAINT gift_orders_dispute_status_valid CHECK (dispute_status IS NULL OR dispute_status IN ('open', 'won', 'lost')),
  risk_flag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  funded_at TIMESTAMPTZ,
  expiry_reconciled_at TIMESTAMPTZ,
  adverse_reconciled_at TIMESTAMPTZ,
  CONSTRAINT gift_orders_purchaser_request_unique UNIQUE (purchaser_user_id, purchaser_request_id),
  CONSTRAINT gift_orders_delivery_schedule_valid CHECK (
    (delivery_mode = 'now' AND scheduled_delivery_at IS NULL AND delivery_timezone IS NULL)
    OR (delivery_mode = 'scheduled' AND scheduled_delivery_at IS NOT NULL AND delivery_timezone IS NOT NULL)
  ),
  CONSTRAINT gift_orders_redeemed_binding_valid CHECK ((redeemed_at IS NULL) = (redeemed_by_user_id IS NULL))
);

CREATE TABLE IF NOT EXISTS gift_order_events (
  id BIGSERIAL PRIMARY KEY,
  gift_order_id TEXT NOT NULL REFERENCES gift_orders(id),
  stripe_event_id TEXT,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stripe_event_id),
  UNIQUE (gift_order_id, event_key)
);

CREATE TABLE IF NOT EXISTS founder_spot_reservations (
  founder_number INTEGER PRIMARY KEY CONSTRAINT founder_spot_reservations_number_valid CHECK (founder_number BETWEEN 1 AND 100),
  source_type TEXT NOT NULL CONSTRAINT founder_spot_reservations_source_valid CHECK (source_type IN ('direct', 'gift')),
  source_id TEXT NOT NULL UNIQUE,
  gift_order_id TEXT UNIQUE REFERENCES gift_orders(id),
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT founder_spot_reservations_status_valid CHECK (status IN ('reserved', 'assigned', 'revoked')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS founder_reconciliation_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  clerk_user_count INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_redemption_recipients (
  gift_order_id TEXT PRIMARY KEY REFERENCES gift_orders(id),
  user_id TEXT NOT NULL,
  verified_email TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'activation_started', 'finalized', 'abandoned')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activation_started_at TIMESTAMPTZ,
  activation_attempts INTEGER NOT NULL DEFAULT 0,
  last_activation_error TEXT,
  finalized_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_recipient_locks (
  lock_key TEXT PRIMARY KEY,
  gift_order_id TEXT NOT NULL REFERENCES gift_orders(id),
  claim_token TEXT NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_payment_attempts (
  gift_order_id TEXT NOT NULL REFERENCES gift_orders(id),
  checkout_attempt INTEGER NOT NULL,
  checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','late_payment','failed','expired','refunded')),
  refund_handling TEXT CHECK (refund_handling IS NULL OR refund_handling IN ('automatic_pending','automatic_succeeded','manual_required')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gift_order_id, checkout_attempt)
);

CREATE TABLE IF NOT EXISTS direct_founder_checkout_reservations (
  attempt_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  founder_number INTEGER NOT NULL REFERENCES founder_spot_reservations(founder_number),
  checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT UNIQUE,
  entitlement_version TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','open','paid','late_payment','expired','failed','refunded','disputed')),
  dispute_status TEXT CHECK (dispute_status IS NULL OR dispute_status IN ('open','won','lost')),
  refund_handling TEXT CHECK (refund_handling IS NULL OR refund_handling IN ('automatic_pending','automatic_succeeded','manual_required')),
  physical_fulfillment_review BOOLEAN NOT NULL DEFAULT FALSE,
  activation_reconciled_at TIMESTAMPTZ,
  activation_last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS direct_founder_checkout_events (
  id BIGSERIAL PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES direct_founder_checkout_reservations(attempt_id),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS entitlement_version TEXT;
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS expiry_reconciled_at TIMESTAMPTZ;
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS adverse_reconciled_at TIMESTAMPTZ;
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS dispute_status TEXT;
ALTER TABLE gift_redemption_recipients ADD COLUMN IF NOT EXISTS activation_started_at TIMESTAMPTZ;
ALTER TABLE gift_redemption_recipients ADD COLUMN IF NOT EXISTS activation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gift_redemption_recipients ADD COLUMN IF NOT EXISTS last_activation_error TEXT;
ALTER TABLE direct_founder_checkout_reservations ADD COLUMN IF NOT EXISTS activation_reconciled_at TIMESTAMPTZ;
ALTER TABLE direct_founder_checkout_reservations ADD COLUMN IF NOT EXISTS activation_last_error TEXT;
ALTER TABLE founder_spot_reservations DROP CONSTRAINT IF EXISTS founder_spot_reservations_user_id_key;
ALTER TABLE direct_founder_checkout_reservations DROP CONSTRAINT IF EXISTS direct_founder_checkout_reservations_founder_number_key;
ALTER TABLE gift_redemption_recipients DROP CONSTRAINT IF EXISTS gift_redemption_recipients_verified_email_key;
ALTER TABLE gift_redemption_recipients DROP CONSTRAINT IF EXISTS gift_redemption_recipients_gift_order_id_key;
ALTER TABLE gift_redemption_recipients DROP CONSTRAINT IF EXISTS gift_redemption_recipients_status_check;
ALTER TABLE gift_orders DROP CONSTRAINT IF EXISTS gift_orders_delivery_status_valid;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name = 'gift_redemption_recipients' AND column_name = 'activated_at') THEN
    EXECUTE 'UPDATE gift_redemption_recipients SET activation_started_at = COALESCE(activation_started_at, activated_at) WHERE status = ''activated''';
  END IF;
  UPDATE gift_redemption_recipients SET status = 'activation_started' WHERE status = 'activated';
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gift_redemption_recipients_pkey'
      AND conrelid = 'gift_redemption_recipients'::regclass
      AND pg_get_constraintdef(oid) NOT ILIKE '%(gift_order_id)%'
  ) THEN
    ALTER TABLE gift_redemption_recipients DROP CONSTRAINT gift_redemption_recipients_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_redemption_recipients_pkey' AND conrelid = 'gift_redemption_recipients'::regclass) THEN
    ALTER TABLE gift_redemption_recipients ADD CONSTRAINT gift_redemption_recipients_pkey PRIMARY KEY (gift_order_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_redemption_recipients_claim_token_key' AND conrelid = 'gift_redemption_recipients'::regclass) THEN
    ALTER TABLE gift_redemption_recipients ADD CONSTRAINT gift_redemption_recipients_claim_token_key UNIQUE (claim_token);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_redemption_recipients_status_check' AND conrelid = 'gift_redemption_recipients'::regclass) THEN
    ALTER TABLE gift_redemption_recipients ADD CONSTRAINT gift_redemption_recipients_status_check
      CHECK (status IN ('claimed', 'activation_started', 'finalized', 'abandoned'));
  END IF;
END;
$$;
ALTER TABLE gift_orders ADD CONSTRAINT gift_orders_delivery_status_valid
  CHECK (delivery_status IN ('waiting', 'due', 'claimed', 'sending', 'delivered', 'failed', 'suppressed'));
UPDATE gift_orders SET redemption_token_key_version = 'v1'
WHERE redemption_token_hash IS NOT NULL AND redemption_token_key_version IS NULL;
UPDATE gift_orders SET entitlement_version = md5(id || redemption_token_hash)
WHERE redemption_token_hash IS NOT NULL AND entitlement_version IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_orders_token_version_required' AND conrelid = 'gift_orders'::regclass) THEN
    ALTER TABLE gift_orders ADD CONSTRAINT gift_orders_token_version_required
      CHECK (redemption_token_hash IS NULL OR redemption_token_key_version IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_orders_entitlement_version_required' AND conrelid = 'gift_orders'::regclass) THEN
    ALTER TABLE gift_orders ADD CONSTRAINT gift_orders_entitlement_version_required
      CHECK (redemption_token_hash IS NULL OR entitlement_version IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_orders_dispute_status_valid' AND conrelid = 'gift_orders'::regclass) THEN
    ALTER TABLE gift_orders ADD CONSTRAINT gift_orders_dispute_status_valid
      CHECK (dispute_status IS NULL OR dispute_status IN ('open', 'won', 'lost'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS gift_orders_delivery_due_idx ON gift_orders (delivery_status, scheduled_delivery_at, funded_at);
CREATE INDEX IF NOT EXISTS gift_orders_recipient_idx ON gift_orders (LOWER(recipient_email), payment_status);
CREATE INDEX IF NOT EXISTS gift_order_events_order_idx ON gift_order_events (gift_order_id, created_at);
CREATE INDEX IF NOT EXISTS founder_spot_reservations_status_idx ON founder_spot_reservations (status, founder_number);
CREATE INDEX IF NOT EXISTS gift_orders_expiry_reconciliation_idx ON gift_orders (expiry_reconciled_at, access_expires_at) WHERE redeemed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS gift_orders_adverse_reconciliation_idx ON gift_orders (adverse_reconciled_at, updated_at) WHERE refunded_at IS NOT NULL OR disputed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS gift_redemption_activation_idx ON gift_redemption_recipients (status, activation_started_at);
CREATE INDEX IF NOT EXISTS gift_recipient_locks_expiry_idx ON gift_recipient_locks (locked_until);
CREATE INDEX IF NOT EXISTS gift_payment_attempts_order_idx ON gift_payment_attempts (gift_order_id, checkout_attempt);
CREATE INDEX IF NOT EXISTS direct_founder_checkout_user_idx ON direct_founder_checkout_reservations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_founder_checkout_events_attempt_idx ON direct_founder_checkout_events (attempt_id, created_at);
CREATE INDEX IF NOT EXISTS direct_founder_activation_reconciliation_idx
  ON direct_founder_checkout_reservations (activation_reconciled_at, updated_at)
  WHERE status = 'paid';
CREATE UNIQUE INDEX IF NOT EXISTS founder_spot_assigned_user_idx ON founder_spot_reservations (user_id) WHERE status = 'assigned' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS direct_founder_checkout_live_user_idx
  ON direct_founder_checkout_reservations (user_id) WHERE status IN ('creating','open');

CREATE OR REPLACE FUNCTION prevent_gift_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gift_order_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS gift_order_events_append_only ON gift_order_events;
CREATE TRIGGER gift_order_events_append_only
BEFORE UPDATE OR DELETE ON gift_order_events
FOR EACH ROW EXECUTE FUNCTION prevent_gift_event_mutation();

CREATE OR REPLACE FUNCTION reserve_founder_spot(
  p_source_type TEXT,
  p_source_id TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_gift_order_id TEXT DEFAULT NULL
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE allocated INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bourbon-signal-founder-spots-v1'));
  SELECT founder_number INTO allocated FROM founder_spot_reservations WHERE source_id = p_source_id AND status IN ('reserved','assigned');
  IF allocated IS NOT NULL THEN RETURN allocated; END IF;
  UPDATE founder_spot_reservations SET source_type = p_source_type, source_id = p_source_id,
    user_id = p_user_id, gift_order_id = p_gift_order_id, status = 'reserved', reserved_at = NOW(),
    assigned_at = NULL, updated_at = NOW()
  WHERE founder_number = (
    SELECT founder_number FROM founder_spot_reservations
    WHERE source_id = p_source_id AND status = 'revoked' ORDER BY updated_at DESC LIMIT 1
  ) AND status = 'revoked'
  RETURNING founder_number INTO allocated;
  IF allocated IS NOT NULL THEN RETURN allocated; END IF;
  SELECT candidate INTO allocated
  FROM generate_series(1, 100) candidate
  WHERE NOT EXISTS (SELECT 1 FROM founder_spot_reservations existing WHERE existing.founder_number = candidate AND existing.status IN ('reserved','assigned'))
  ORDER BY candidate LIMIT 1;
  IF allocated IS NULL THEN RAISE EXCEPTION 'Founder memberships are sold out'; END IF;
  INSERT INTO founder_spot_reservations (founder_number, source_type, source_id, user_id, gift_order_id)
  VALUES (allocated, p_source_type, p_source_id, p_user_id, p_gift_order_id)
  ON CONFLICT (founder_number) DO UPDATE SET source_type = EXCLUDED.source_type, source_id = EXCLUDED.source_id,
    user_id = EXCLUDED.user_id, gift_order_id = EXCLUDED.gift_order_id, status = 'reserved', reserved_at = NOW(),
    assigned_at = NULL, updated_at = NOW()
  WHERE founder_spot_reservations.status = 'revoked';
  RETURN allocated;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_founder_gift_reservation(p_gift_order_id TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE released INTEGER; order_funded_at TIMESTAMPTZ;
BEGIN
  SELECT orders.funded_at INTO order_funded_at
  FROM gift_orders orders WHERE orders.id = p_gift_order_id FOR UPDATE;
  IF NOT FOUND OR order_funded_at IS NOT NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bourbon-signal-founder-spots-v1'));
  UPDATE founder_spot_reservations SET status = 'revoked',
    source_id = 'revoked:' || founder_number || ':' || md5(source_id || clock_timestamp()::TEXT),
    gift_order_id = NULL, user_id = NULL, updated_at = NOW()
  WHERE gift_order_id = p_gift_order_id AND status = 'reserved'
    AND NOT EXISTS (
      SELECT 1 FROM gift_redemption_recipients claims
      WHERE claims.gift_order_id = p_gift_order_id AND claims.status IN ('activation_started','finalized')
    )
  RETURNING founder_number INTO released;
  RETURN released;
END;
$$;

CREATE OR REPLACE FUNCTION claim_founder_gift_checkout(p_order_id TEXT, p_purchaser_user_id TEXT, p_claim_token TEXT)
RETURNS TABLE(order_id TEXT, founder_number INTEGER) LANGUAGE plpgsql AS $$
DECLARE allocated INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM founder_reconciliation_state WHERE singleton = TRUE
      AND completed_at >= NOW() - INTERVAL '10 minutes'
  ) THEN RAISE EXCEPTION 'Founder authority reconciliation is not ready'; END IF;
  UPDATE gift_orders SET checkout_claim_token = p_claim_token, checkout_claimed_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id AND purchaser_user_id = p_purchaser_user_id
    AND gift_plan = 'founder_lifetime_gift' AND payment_status IN ('pending','checkout_open')
    AND stripe_checkout_session_id IS NULL
    AND (checkout_claimed_at IS NULL OR checkout_claimed_at < NOW() - INTERVAL '15 minutes');
  IF NOT FOUND THEN RETURN; END IF;
  allocated := reserve_founder_spot('gift', 'gift:' || p_order_id, NULL, p_order_id);
  RETURN QUERY SELECT p_order_id, allocated;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_existing_founder_spot(p_user_id TEXT, p_founder_number INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE existing_number INTEGER;
BEGIN
  IF p_founder_number < 1 OR p_founder_number > 100 THEN RAISE EXCEPTION 'Invalid Founder number'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bourbon-signal-founder-spots-v1'));
  SELECT founder_number INTO existing_number FROM founder_spot_reservations WHERE user_id = p_user_id AND status = 'assigned';
  IF existing_number IS NOT NULL THEN
    IF existing_number <> p_founder_number THEN RAISE EXCEPTION 'Founder number mismatch'; END IF;
    UPDATE founder_spot_reservations SET status = 'assigned', assigned_at = COALESCE(assigned_at, NOW()), updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN existing_number;
  END IF;
  INSERT INTO founder_spot_reservations (founder_number, source_type, source_id, user_id, status, assigned_at)
  VALUES (p_founder_number, 'direct', 'direct:' || p_user_id, p_user_id, 'assigned', NOW())
  ON CONFLICT (founder_number) DO UPDATE SET source_type = 'direct', source_id = EXCLUDED.source_id,
    user_id = EXCLUDED.user_id, gift_order_id = NULL, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
  WHERE founder_spot_reservations.status = 'revoked';
  IF NOT FOUND THEN RAISE EXCEPTION 'Founder number is already owned by another membership'; END IF;
  RETURN p_founder_number;
END;
$$;

CREATE OR REPLACE FUNCTION claim_direct_founder_checkout(p_attempt_id TEXT, p_user_id TEXT)
RETURNS TABLE(attempt_id TEXT, founder_number INTEGER, entitlement_version TEXT) LANGUAGE plpgsql AS $$
DECLARE allocated INTEGER; version TEXT; requested_attempt_id TEXT; existing_attempt_id TEXT; returned_attempt_id TEXT;
BEGIN
  requested_attempt_id := p_attempt_id;
  IF NOT EXISTS (
    SELECT 1 FROM founder_reconciliation_state WHERE singleton = TRUE
      AND completed_at >= NOW() - INTERVAL '10 minutes'
  ) THEN RAISE EXCEPTION 'Founder authority reconciliation is not ready'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('direct-founder-user:' || p_user_id));
  SELECT reservations.attempt_id, reservations.founder_number, reservations.entitlement_version
    INTO existing_attempt_id, allocated, version
  FROM direct_founder_checkout_reservations reservations
  WHERE reservations.user_id = p_user_id AND (
    reservations.attempt_id = requested_attempt_id OR reservations.status IN ('creating','open')
  )
  ORDER BY (reservations.attempt_id = requested_attempt_id) DESC, reservations.created_at
  LIMIT 1;
  IF allocated IS NOT NULL THEN RETURN QUERY SELECT existing_attempt_id, allocated, version; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM founder_spot_reservations WHERE user_id = p_user_id AND status = 'assigned') THEN
    RAISE EXCEPTION 'Founder membership is already assigned';
  END IF;
  allocated := reserve_founder_spot('direct', 'direct-checkout:' || requested_attempt_id, p_user_id, NULL);
  version := md5(requested_attempt_id || ':' || p_user_id || ':' || clock_timestamp()::TEXT);
  INSERT INTO direct_founder_checkout_reservations (attempt_id, user_id, founder_number, entitlement_version)
  VALUES (requested_attempt_id, p_user_id, allocated, version)
  ON CONFLICT (user_id) WHERE status IN ('creating','open') DO UPDATE
    SET updated_at = direct_founder_checkout_reservations.updated_at
  RETURNING direct_founder_checkout_reservations.attempt_id,
    direct_founder_checkout_reservations.founder_number,
    direct_founder_checkout_reservations.entitlement_version
  INTO returned_attempt_id, allocated, version;
  IF returned_attempt_id <> requested_attempt_id THEN
    UPDATE founder_spot_reservations SET status = 'revoked', user_id = NULL,
      source_id = 'revoked:' || founder_number || ':' || md5(source_id || clock_timestamp()::TEXT), updated_at = NOW()
    WHERE source_id = 'direct-checkout:' || requested_attempt_id AND status = 'reserved';
  END IF;
  RETURN QUERY SELECT returned_attempt_id, allocated, version;
END;
$$;

CREATE OR REPLACE FUNCTION complete_direct_founder_checkout(
  p_attempt_id TEXT, p_user_id TEXT, p_checkout_session_id TEXT,
  p_payment_intent_id TEXT, p_charge_id TEXT
) RETURNS TABLE(founder_number INTEGER, entitlement_version TEXT, newly_paid BOOLEAN, late_payment BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE target direct_founder_checkout_reservations%ROWTYPE; already_paid BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('direct-founder-user:' || p_user_id));
  SELECT * INTO target FROM direct_founder_checkout_reservations
  WHERE attempt_id = p_attempt_id AND user_id = p_user_id AND checkout_session_id = p_checkout_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF target.status IN ('paid','refunded','disputed') THEN
    UPDATE direct_founder_checkout_reservations SET
      stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
      stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id), updated_at = NOW()
    WHERE attempt_id = p_attempt_id;
    RETURN QUERY SELECT target.founder_number, target.entitlement_version, FALSE, FALSE; RETURN;
  END IF;
  IF target.status IN ('expired','failed','late_payment') THEN
    UPDATE direct_founder_checkout_reservations SET status = 'late_payment',
      stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
      stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id),
      refund_handling = COALESCE(refund_handling, 'automatic_pending'), updated_at = NOW()
    WHERE attempt_id = p_attempt_id;
    RETURN QUERY SELECT target.founder_number, target.entitlement_version, FALSE, TRUE; RETURN;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM direct_founder_checkout_reservations other
    WHERE other.user_id = p_user_id AND other.attempt_id <> p_attempt_id
      AND other.status IN ('paid','refunded','disputed')
  ) OR EXISTS (
    SELECT 1 FROM founder_spot_reservations spots
    WHERE spots.user_id = p_user_id AND spots.status = 'assigned'
      AND spots.founder_number <> target.founder_number
  ) INTO already_paid;
  IF already_paid THEN
    UPDATE direct_founder_checkout_reservations SET status = 'late_payment',
      stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
      stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id), refund_handling = 'automatic_pending', updated_at = NOW()
    WHERE attempt_id = p_attempt_id;
    UPDATE founder_spot_reservations SET status = 'revoked', user_id = NULL,
      source_id = 'revoked:' || founder_number || ':' || md5(source_id || clock_timestamp()::TEXT), updated_at = NOW()
    WHERE source_id = 'direct-checkout:' || p_attempt_id AND status = 'reserved';
    RETURN QUERY SELECT target.founder_number, target.entitlement_version, FALSE, TRUE; RETURN;
  END IF;
  UPDATE direct_founder_checkout_reservations SET status = 'paid', paid_at = COALESCE(paid_at, NOW()),
    stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
    stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id), updated_at = NOW()
  WHERE attempt_id = p_attempt_id;
  UPDATE founder_spot_reservations AS spots SET source_type = 'direct', source_id = 'direct-checkout:' || p_attempt_id,
    gift_order_id = NULL, status = 'assigned', assigned_at = COALESCE(spots.assigned_at, NOW()), updated_at = NOW()
  WHERE spots.founder_number = target.founder_number AND spots.user_id = p_user_id
    AND (spots.status = 'reserved' OR (spots.status = 'assigned' AND NOT EXISTS (
      SELECT 1 FROM direct_founder_checkout_reservations other
      WHERE other.user_id = p_user_id AND other.attempt_id <> p_attempt_id
        AND other.status IN ('paid','refunded','disputed')
    )));
  IF NOT FOUND THEN RAISE EXCEPTION 'Founder checkout reservation is unavailable'; END IF;
  RETURN QUERY SELECT target.founder_number, target.entitlement_version, TRUE, FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION abandon_adverse_gift_claim(p_order_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed_count INTEGER;
BEGIN
  UPDATE gift_redemption_recipients SET status = 'abandoned',
    last_activation_error = 'Gift payment became adverse during activation', updated_at = NOW()
  WHERE gift_order_id = p_order_id AND status IN ('claimed','activation_started');
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  DELETE FROM gift_recipient_locks WHERE gift_order_id = p_order_id;
  PERFORM revoke_founder_gift_reservation(p_order_id);
  RETURN changed_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION record_gift_dispute(
  p_order_id TEXT, p_stripe_event_id TEXT, p_state TEXT
) RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
BEGIN
  IF p_state NOT IN ('open','won','lost') THEN RAISE EXCEPTION 'Invalid gift dispute state'; END IF;
  INSERT INTO gift_order_events (gift_order_id, stripe_event_id, event_key, event_type, event_payload)
  VALUES (p_order_id, p_stripe_event_id, 'stripe:' || p_stripe_event_id, 'dispute_' || p_state,
    jsonb_build_object('dispute_state', p_state))
  ON CONFLICT DO NOTHING;
  UPDATE gift_orders SET
    disputed_at = CASE WHEN p_state = 'won' THEN NULL ELSE COALESCE(disputed_at, NOW()) END,
    dispute_status = p_state,
    payment_status = CASE
      WHEN p_state = 'won' AND refunded_at IS NULL AND payment_status = 'disputed' THEN 'funded'
      WHEN p_state <> 'won' THEN 'disputed' ELSE payment_status END,
    risk_flag = CASE WHEN p_state = 'won' AND refunded_at IS NULL THEN NULL
      WHEN gift_plan = 'founder_lifetime_gift' AND (
        redeemed_at IS NOT NULL OR EXISTS (SELECT 1 FROM gift_redemption_recipients claims
          WHERE claims.gift_order_id = gift_orders.id AND claims.status IN ('activation_started','finalized'))
      ) THEN 'founder_manual_review'
      ELSE 'dispute_' || p_state END,
    delivery_status = CASE WHEN p_state <> 'won' AND delivery_provider_message_id IS NULL THEN 'suppressed' ELSE delivery_status END,
    delivery_claimed_at = CASE WHEN p_state <> 'won' AND delivery_provider_message_id IS NULL THEN NULL ELSE delivery_claimed_at END,
    delivery_claim_token = CASE WHEN p_state <> 'won' AND delivery_provider_message_id IS NULL THEN NULL ELSE delivery_claim_token END,
    adverse_reconciled_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id
    AND EXISTS (SELECT 1 FROM gift_order_events WHERE stripe_event_id = p_stripe_event_id AND gift_order_id = p_order_id)
    AND ((p_state = 'open' AND (dispute_status IS NULL OR dispute_status = 'open'))
      OR (p_state = 'won' AND (dispute_status IS NULL OR dispute_status IN ('open','won')))
      OR (p_state = 'lost' AND (dispute_status IS NULL OR dispute_status IN ('open','lost'))));
  IF p_state <> 'won' THEN
    PERFORM abandon_adverse_gift_claim(p_order_id);
    IF EXISTS (SELECT 1 FROM gift_orders WHERE id = p_order_id AND redeemed_at IS NULL) THEN
      PERFORM revoke_founder_gift_reservation(p_order_id);
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM gift_orders WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION fund_gift_order(
  p_order_id TEXT,
  p_stripe_event_id TEXT,
  p_checkout_session_id TEXT,
  p_payment_intent_id TEXT,
  p_charge_id TEXT,
  p_token_hash TEXT,
  p_token_key_version TEXT,
  p_checkout_attempt INTEGER
) RETURNS TABLE(order_id TEXT, newly_funded BOOLEAN, founder_number INTEGER, late_payment BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE target gift_orders%ROWTYPE; inserted_event BIGINT; reserved_number INTEGER;
BEGIN
  SELECT * INTO target FROM gift_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift order not found'; END IF;
  INSERT INTO gift_order_events (gift_order_id, stripe_event_id, event_key, event_type, event_payload)
  VALUES (p_order_id, p_stripe_event_id, 'stripe:' || p_stripe_event_id,
    CASE WHEN target.checkout_attempt = p_checkout_attempt AND target.stripe_checkout_session_id = p_checkout_session_id
      THEN 'payment_succeeded' ELSE 'late_payment' END,
    jsonb_build_object('checkout_session_id', p_checkout_session_id, 'checkout_attempt', p_checkout_attempt,
      'payment_intent_id', p_payment_intent_id, 'charge_id', p_charge_id))
  ON CONFLICT DO NOTHING RETURNING id INTO inserted_event;
  IF inserted_event IS NULL THEN
    SELECT reservations.founder_number INTO reserved_number FROM founder_spot_reservations reservations WHERE reservations.gift_order_id = p_order_id;
    RETURN QUERY SELECT p_order_id, FALSE, reserved_number, FALSE; RETURN;
  END IF;
  INSERT INTO gift_payment_attempts (gift_order_id, checkout_attempt, checkout_session_id, stripe_payment_intent_id, stripe_charge_id, status, paid_at)
  VALUES (p_order_id, p_checkout_attempt, p_checkout_session_id, p_payment_intent_id, p_charge_id,
    CASE WHEN target.checkout_attempt = p_checkout_attempt AND target.stripe_checkout_session_id = p_checkout_session_id THEN 'paid' ELSE 'late_payment' END, NOW())
  ON CONFLICT (gift_order_id, checkout_attempt) DO UPDATE SET
    stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, gift_payment_attempts.stripe_payment_intent_id),
    stripe_charge_id = COALESCE(EXCLUDED.stripe_charge_id, gift_payment_attempts.stripe_charge_id),
    status = CASE WHEN gift_payment_attempts.checkout_session_id = EXCLUDED.checkout_session_id
      AND target.checkout_attempt = p_checkout_attempt AND target.stripe_checkout_session_id = p_checkout_session_id THEN 'paid' ELSE 'late_payment' END,
    paid_at = COALESCE(gift_payment_attempts.paid_at, NOW()), updated_at = NOW();
  IF target.checkout_attempt <> p_checkout_attempt OR target.stripe_checkout_session_id <> p_checkout_session_id THEN
    UPDATE gift_payment_attempts SET refund_handling = 'automatic_pending', updated_at = NOW()
    WHERE gift_order_id = p_order_id AND checkout_attempt = p_checkout_attempt;
    UPDATE gift_orders SET risk_flag = 'late_payment_refund_required', updated_at = NOW() WHERE id = p_order_id;
    RETURN QUERY SELECT p_order_id, FALSE, NULL::INTEGER, TRUE; RETURN;
  END IF;
  IF target.refunded_at IS NOT NULL OR target.disputed_at IS NOT NULL OR target.payment_status IN ('refunded','disputed') THEN
    UPDATE gift_orders SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_checkout_session_id),
      stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent_id),
      stripe_charge_id = COALESCE(stripe_charge_id, p_charge_id), risk_flag = COALESCE(risk_flag, 'adverse_payment'),
      delivery_status = CASE WHEN delivery_provider_message_id IS NULL THEN 'suppressed' ELSE delivery_status END, updated_at = NOW()
    WHERE id = p_order_id;
    RETURN QUERY SELECT p_order_id, FALSE, NULL::INTEGER, FALSE; RETURN;
  END IF;
  IF target.payment_status = 'funded' THEN
    UPDATE gift_orders SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_checkout_session_id),
      stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent_id),
      stripe_charge_id = COALESCE(stripe_charge_id, p_charge_id), updated_at = NOW() WHERE id = p_order_id;
    RETURN QUERY SELECT p_order_id, FALSE, NULL::INTEGER, FALSE; RETURN;
  END IF;
  IF target.gift_plan = 'founder_lifetime_gift' THEN
    SELECT reservations.founder_number INTO reserved_number FROM founder_spot_reservations reservations
    WHERE reservations.gift_order_id = p_order_id AND reservations.status = 'reserved' FOR UPDATE;
    IF reserved_number IS NULL THEN
      UPDATE gift_orders SET payment_status = 'failed', risk_flag = 'founder_reservation_missing',
        delivery_status = 'suppressed', updated_at = NOW() WHERE id = p_order_id;
      RETURN QUERY SELECT p_order_id, FALSE, NULL::INTEGER, FALSE; RETURN;
    END IF;
  END IF;
  UPDATE gift_orders SET payment_status = 'funded', stripe_checkout_session_id = COALESCE(p_checkout_session_id, stripe_checkout_session_id),
    stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id), stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id),
    redemption_token_hash = COALESCE(redemption_token_hash, p_token_hash), redemption_token_key_version = COALESCE(redemption_token_key_version, p_token_key_version),
    entitlement_version = COALESCE(entitlement_version, md5(p_order_id || p_token_hash)),
    funded_at = COALESCE(funded_at, NOW()), delivery_status = CASE WHEN delivery_status = 'waiting' THEN 'due' ELSE delivery_status END, updated_at = NOW()
  WHERE id = p_order_id;
  RETURN QUERY SELECT p_order_id, TRUE, reserved_number, FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION record_gift_refund(
  p_order_id TEXT, p_stripe_event_id TEXT, p_event_type TEXT, p_full_refund BOOLEAN,
  p_refund_state TEXT, p_amount_refunded BIGINT, p_amount BIGINT
) RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO gift_order_events (gift_order_id, stripe_event_id, event_key, event_type, event_payload)
  VALUES (p_order_id, p_stripe_event_id, 'stripe:' || p_stripe_event_id, p_event_type,
    jsonb_build_object('refund_state',p_refund_state,'full_refund',p_full_refund,
      'amount_refunded',p_amount_refunded,'amount',p_amount))
  ON CONFLICT DO NOTHING;
  UPDATE gift_orders SET
    refunded_at = CASE WHEN p_full_refund THEN COALESCE(refunded_at, NOW()) ELSE refunded_at END,
    payment_status = CASE WHEN p_full_refund AND disputed_at IS NULL THEN 'refunded' ELSE payment_status END,
    risk_flag = CASE
      WHEN p_full_refund AND gift_plan = 'founder_lifetime_gift' AND (
        redeemed_at IS NOT NULL OR EXISTS (SELECT 1 FROM gift_redemption_recipients claims
          WHERE claims.gift_order_id = p_order_id AND claims.status IN ('activation_started','finalized'))
      ) THEN 'founder_manual_review'
      WHEN p_full_refund THEN 'full_refund' ELSE 'refund_' || p_refund_state END,
    delivery_status = CASE WHEN p_full_refund AND delivery_provider_message_id IS NULL THEN 'suppressed' ELSE delivery_status END,
    delivery_claimed_at = CASE WHEN p_full_refund AND delivery_provider_message_id IS NULL THEN NULL ELSE delivery_claimed_at END,
    delivery_claim_token = CASE WHEN p_full_refund AND delivery_provider_message_id IS NULL THEN NULL ELSE delivery_claim_token END,
    adverse_reconciled_at = CASE WHEN p_full_refund THEN NULL ELSE adverse_reconciled_at END, updated_at = NOW()
  WHERE id = p_order_id AND EXISTS (
    SELECT 1 FROM gift_order_events WHERE stripe_event_id = p_stripe_event_id AND gift_order_id = p_order_id
  );
  IF p_full_refund AND EXISTS (SELECT 1 FROM gift_orders WHERE id = p_order_id AND redeemed_at IS NULL) THEN
    PERFORM abandon_adverse_gift_claim(p_order_id);
    PERFORM revoke_founder_gift_reservation(p_order_id);
  END IF;
  RETURN QUERY SELECT * FROM gift_orders WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION authorize_gift_delivery_send(p_order_id TEXT, p_claim_token TEXT)
RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY UPDATE gift_orders SET delivery_status = 'sending', updated_at = NOW()
  WHERE id = p_order_id AND delivery_claim_token = p_claim_token
    AND delivery_status = 'claimed' AND delivery_provider_message_id IS NULL
    AND payment_status = 'funded' AND refunded_at IS NULL AND disputed_at IS NULL
    AND redeemed_at IS NULL
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION claim_due_gift_deliveries(p_claim_token TEXT, p_limit INTEGER DEFAULT 25)
RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id FROM gift_orders
    WHERE payment_status = 'funded' AND refunded_at IS NULL AND disputed_at IS NULL AND redeemed_at IS NULL
      AND delivery_provider_message_id IS NULL
      AND COALESCE(scheduled_delivery_at, funded_at) <= NOW()
      AND (delivery_claimed_at IS NULL OR delivery_claimed_at < NOW() - INTERVAL '15 minutes')
    ORDER BY COALESCE(scheduled_delivery_at, funded_at), id
    FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE gift_orders orders SET delivery_status = 'claimed', delivery_claimed_at = NOW(), delivery_claim_token = p_claim_token,
    delivery_idempotency_key = COALESCE(delivery_idempotency_key, 'gift-delivery-' || orders.id), delivery_attempts = delivery_attempts + 1, updated_at = NOW()
  FROM due WHERE orders.id = due.id RETURNING orders.*;
END;
$$;

CREATE OR REPLACE FUNCTION claim_gift_redemption(
  p_order_id TEXT,
  p_token_hash TEXT,
  p_user_id TEXT,
  p_verified_email TEXT,
  p_claim_token TEXT
) RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
DECLARE target gift_orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gift-redemption-user:' || p_user_id));
  PERFORM pg_advisory_xact_lock(hashtext('gift-redemption-email:' || LOWER(p_verified_email)));
  SELECT * INTO target FROM gift_orders WHERE id = p_order_id AND redemption_token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift code is invalid'; END IF;
  IF target.purchaser_user_id = p_user_id THEN RAISE EXCEPTION 'Purchasers cannot redeem their own gift'; END IF;
  IF LOWER(target.recipient_email) <> LOWER(p_verified_email) THEN RAISE EXCEPTION 'Gift recipient email does not match'; END IF;
  IF target.payment_status <> 'funded' OR target.refunded_at IS NOT NULL OR target.disputed_at IS NOT NULL THEN RAISE EXCEPTION 'Gift is not redeemable'; END IF;
  IF target.redeemed_at IS NOT NULL THEN
    IF target.redeemed_by_user_id = p_user_id AND LOWER(target.redeemed_by_email) = LOWER(p_verified_email) THEN
      RETURN QUERY SELECT * FROM gift_orders WHERE id = target.id; RETURN;
    END IF;
    RAISE EXCEPTION 'Gift was already redeemed';
  END IF;
  IF target.gift_plan = 'founder_lifetime_gift' AND EXISTS (
    SELECT 1 FROM founder_spot_reservations WHERE user_id = p_user_id AND status = 'assigned'
  ) THEN RAISE EXCEPTION 'A Founder number is already retained by this recipient'; END IF;
  IF EXISTS (
    SELECT 1 FROM gift_orders active
    WHERE active.id <> target.id AND active.redeemed_by_user_id = p_user_id
      AND LOWER(active.redeemed_by_email) = LOWER(p_verified_email)
      AND active.payment_status = 'funded' AND active.refunded_at IS NULL AND active.disputed_at IS NULL
      AND (active.access_expires_at IS NULL OR active.access_expires_at > NOW())
      AND CASE active.gift_tier WHEN 'bottled-in-bond' THEN 3 WHEN 'barrel' THEN 2 WHEN 'standard' THEN 1 ELSE 0 END
        >= CASE target.gift_tier WHEN 'bottled-in-bond' THEN 3 WHEN 'barrel' THEN 2 WHEN 'standard' THEN 1 ELSE 0 END
  ) THEN RAISE EXCEPTION 'An active gift already includes this entitlement level'; END IF;
  IF EXISTS (
    SELECT 1 FROM gift_redemption_recipients saga
    WHERE saga.gift_order_id <> target.id AND saga.status = 'activation_started'
      AND (saga.user_id = p_user_id OR saga.verified_email = LOWER(p_verified_email))
  ) THEN RAISE EXCEPTION 'A gift activation is already being reconciled for this recipient'; END IF;
  DELETE FROM gift_recipient_locks WHERE locked_until <= NOW();
  IF EXISTS (
    SELECT 1 FROM gift_recipient_locks
    WHERE lock_key IN ('user:' || p_user_id, 'email:' || LOWER(p_verified_email))
      AND gift_order_id <> p_order_id AND locked_until > NOW()
  ) THEN RAISE EXCEPTION 'A different gift is already claimed by this recipient'; END IF;
  INSERT INTO gift_redemption_recipients (gift_order_id, user_id, verified_email, claim_token, status)
  VALUES (target.id, p_user_id, LOWER(p_verified_email), p_claim_token, 'claimed')
  ON CONFLICT (gift_order_id) DO UPDATE SET
    claim_token = CASE WHEN gift_redemption_recipients.status = 'activation_started'
      THEN gift_redemption_recipients.claim_token ELSE EXCLUDED.claim_token END,
    status = CASE WHEN gift_redemption_recipients.status = 'activation_started'
      THEN gift_redemption_recipients.status ELSE 'claimed' END,
    claimed_at = CASE WHEN gift_redemption_recipients.status = 'activation_started'
      THEN gift_redemption_recipients.claimed_at ELSE NOW() END,
    updated_at = NOW()
  WHERE gift_redemption_recipients.user_id = EXCLUDED.user_id
    AND gift_redemption_recipients.verified_email = EXCLUDED.verified_email
    AND gift_redemption_recipients.status <> 'finalized';
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift redemption claim is unavailable'; END IF;
  INSERT INTO gift_recipient_locks (lock_key, gift_order_id, claim_token, locked_until)
  SELECT lock_key, target.id, claims.claim_token, NOW() + INTERVAL '30 minutes'
  FROM gift_redemption_recipients claims
  CROSS JOIN (VALUES ('user:' || p_user_id), ('email:' || LOWER(p_verified_email))) keys(lock_key)
  WHERE claims.gift_order_id = target.id
  ON CONFLICT (lock_key) DO UPDATE SET gift_order_id = EXCLUDED.gift_order_id,
    claim_token = EXCLUDED.claim_token, locked_until = EXCLUDED.locked_until, updated_at = NOW()
  WHERE gift_recipient_locks.gift_order_id = EXCLUDED.gift_order_id OR gift_recipient_locks.locked_until <= NOW();
  IF NOT FOUND THEN RAISE EXCEPTION 'A different gift is already claimed by this recipient'; END IF;
  RETURN QUERY SELECT * FROM gift_orders WHERE id = target.id;
END;
$$;

CREATE OR REPLACE FUNCTION authorize_gift_activation(
  p_order_id TEXT, p_user_id TEXT, p_verified_email TEXT, p_claim_token TEXT
) RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY SELECT orders.* FROM gift_orders orders
  JOIN gift_redemption_recipients claims ON claims.gift_order_id = orders.id
  WHERE orders.id = p_order_id AND claims.user_id = p_user_id
    AND claims.verified_email = LOWER(p_verified_email) AND claims.claim_token = p_claim_token
    AND claims.status = 'activation_started' AND orders.payment_status = 'funded'
    AND orders.refunded_at IS NULL AND orders.disputed_at IS NULL AND orders.redeemed_at IS NULL
  FOR UPDATE OF orders;
END;
$$;

CREATE OR REPLACE FUNCTION begin_gift_redemption_activation(
  p_order_id TEXT, p_user_id TEXT, p_verified_email TEXT, p_claim_token TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE changed_count INTEGER;
BEGIN
  UPDATE gift_redemption_recipients SET status = 'activation_started',
    activation_started_at = COALESCE(activation_started_at, NOW()), activation_attempts = activation_attempts + 1,
    last_activation_error = NULL, updated_at = NOW()
  WHERE gift_order_id = p_order_id AND user_id = p_user_id AND verified_email = LOWER(p_verified_email)
    AND claim_token = p_claim_token AND status IN ('claimed','activation_started');
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  UPDATE gift_recipient_locks SET locked_until = NOW() + INTERVAL '24 hours', updated_at = NOW()
  WHERE gift_order_id = p_order_id AND claim_token = p_claim_token;
  RETURN changed_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_gift_redemption(
  p_order_id TEXT, p_user_id TEXT, p_verified_email TEXT, p_claim_token TEXT, p_redeemed_at TIMESTAMPTZ
) RETURNS SETOF gift_orders LANGUAGE plpgsql AS $$
DECLARE target gift_orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gift-redemption-user:' || p_user_id));
  SELECT * INTO target FROM gift_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR target.payment_status <> 'funded' OR target.refunded_at IS NOT NULL OR target.disputed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gift is not redeemable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gift_redemption_recipients WHERE user_id = p_user_id
    AND verified_email = LOWER(p_verified_email) AND gift_order_id = p_order_id AND claim_token = p_claim_token
    AND status IN ('activation_started','finalized')) THEN RAISE EXCEPTION 'Gift redemption claim is unavailable'; END IF;
  IF target.redeemed_at IS NULL THEN
    UPDATE gift_orders SET redeemed_by_user_id = p_user_id, redeemed_by_email = LOWER(p_verified_email), redeemed_at = p_redeemed_at,
      access_starts_at = p_redeemed_at,
      access_expires_at = CASE WHEN gift_plan IN ('standard_annual_gift', 'barrel_annual_gift') THEN p_redeemed_at + INTERVAL '1 year' ELSE NULL END,
      delivery_status = CASE WHEN delivery_status = 'delivered' THEN delivery_status ELSE 'suppressed' END, updated_at = NOW()
    WHERE id = target.id;
    IF target.gift_plan = 'founder_lifetime_gift' THEN
      UPDATE founder_spot_reservations SET user_id = p_user_id, status = 'assigned', assigned_at = p_redeemed_at, updated_at = NOW()
      WHERE gift_order_id = target.id AND status = 'reserved';
      IF NOT FOUND THEN RAISE EXCEPTION 'Founder reservation is unavailable'; END IF;
    END IF;
  ELSIF target.redeemed_by_user_id <> p_user_id OR LOWER(target.redeemed_by_email) <> LOWER(p_verified_email) THEN
    RAISE EXCEPTION 'Gift was already redeemed';
  END IF;
  UPDATE gift_redemption_recipients SET status = 'finalized', last_activation_error = NULL,
    finalized_at = COALESCE(finalized_at, NOW()), updated_at = NOW()
  WHERE user_id = p_user_id AND gift_order_id = p_order_id AND claim_token = p_claim_token;
  DELETE FROM gift_recipient_locks WHERE gift_order_id = p_order_id AND claim_token = p_claim_token;
  RETURN QUERY SELECT * FROM gift_orders WHERE id = target.id;
END;
$$;
