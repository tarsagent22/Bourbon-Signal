CREATE TABLE IF NOT EXISTS apple_memberships (
  original_transaction_id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  product_id TEXT NOT NULL CHECK (product_id IN (
    'com.bourbonsignal.app.standard.monthly',
    'com.bourbonsignal.app.standard.annual',
    'com.bourbonsignal.app.barrel.monthly',
    'com.bourbonsignal.app.barrel.annual'
  )),
  entitlement_status TEXT NOT NULL CHECK (entitlement_status IN (
    'trialing', 'active', 'canceled_period_end', 'grace_period',
    'billing_issue', 'expired', 'refunded', 'revoked'
  )),
  expires_at TIMESTAMPTZ,
  offer_state TEXT NOT NULL CHECK (offer_state IN (
    'none', 'introductory_trial', 'introductory_offer', 'promotional_offer', 'unknown'
  )),
  ordered_event_at TIMESTAMPTZ NOT NULL,
  status_priority INTEGER NOT NULL,
  last_provider_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at TIMESTAMPTZ,
  UNIQUE (original_transaction_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS apple_memberships_owner_order_idx
  ON apple_memberships (clerk_user_id, ordered_event_at DESC, status_priority DESC);

CREATE TABLE IF NOT EXISTS apple_membership_events (
  provider_event_id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  original_transaction_id TEXT NOT NULL REFERENCES apple_memberships(original_transaction_id),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  product_id TEXT NOT NULL CHECK (product_id IN (
    'com.bourbonsignal.app.standard.monthly',
    'com.bourbonsignal.app.standard.annual',
    'com.bourbonsignal.app.barrel.monthly',
    'com.bourbonsignal.app.barrel.annual'
  )),
  entitlement_status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  offer_state TEXT NOT NULL,
  ordered_event_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apple_membership_events_transaction_order_idx
  ON apple_membership_events (original_transaction_id, ordered_event_at DESC);
