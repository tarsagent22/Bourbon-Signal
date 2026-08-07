CREATE TABLE IF NOT EXISTS founder_glass_shipping (
  user_id TEXT PRIMARY KEY,
  founder_number INTEGER CONSTRAINT founder_glass_shipping_founder_number_positive CHECK (founder_number IS NULL OR founder_number > 0),
  account_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state_code CHAR(2) NOT NULL,
  postal_code TEXT NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'US' CONSTRAINT founder_glass_shipping_country_us CHECK (country_code = 'US'),
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CONSTRAINT founder_glass_shipping_status_valid CHECK (status IN ('submitted', 'confirmed', 'packed', 'shipped')),
  carrier TEXT,
  tracking_number TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_at TIMESTAMPTZ,
  updated_by TEXT,
  shipment_notification_sent_at TIMESTAMPTZ,
  shipment_notification_message_id TEXT,
  shipment_notification_claimed_at TIMESTAMPTZ,
  shipment_notification_claim_token TEXT,
  shipment_notification_idempotency_key TEXT
);

ALTER TABLE founder_glass_shipping ADD COLUMN IF NOT EXISTS shipment_notification_sent_at TIMESTAMPTZ;
ALTER TABLE founder_glass_shipping ADD COLUMN IF NOT EXISTS shipment_notification_message_id TEXT;
ALTER TABLE founder_glass_shipping ADD COLUMN IF NOT EXISTS shipment_notification_claimed_at TIMESTAMPTZ;
ALTER TABLE founder_glass_shipping ADD COLUMN IF NOT EXISTS shipment_notification_claim_token TEXT;
ALTER TABLE founder_glass_shipping ADD COLUMN IF NOT EXISTS shipment_notification_idempotency_key TEXT;

ALTER TABLE founder_glass_shipping ALTER COLUMN founder_number DROP NOT NULL;
ALTER TABLE founder_glass_shipping DROP CONSTRAINT IF EXISTS founder_glass_shipping_founder_number_positive;
ALTER TABLE founder_glass_shipping ADD CONSTRAINT founder_glass_shipping_founder_number_positive
  CHECK (founder_number IS NULL OR founder_number > 0);

CREATE UNIQUE INDEX IF NOT EXISTS founder_glass_shipping_founder_number_idx
  ON founder_glass_shipping (founder_number);
CREATE INDEX IF NOT EXISTS founder_glass_shipping_status_idx
  ON founder_glass_shipping (status, founder_number);
