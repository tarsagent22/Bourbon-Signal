CREATE TABLE IF NOT EXISTS founder_glass_shipping (
  user_id TEXT PRIMARY KEY,
  founder_number INTEGER NOT NULL CONSTRAINT founder_glass_shipping_founder_number_positive CHECK (founder_number > 0),
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
  updated_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS founder_glass_shipping_founder_number_idx
  ON founder_glass_shipping (founder_number);
CREATE INDEX IF NOT EXISTS founder_glass_shipping_status_idx
  ON founder_glass_shipping (status, founder_number);
