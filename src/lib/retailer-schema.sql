CREATE TABLE IF NOT EXISTS retailer_applications (
  user_id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL,
  store_address TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  listed_phone TEXT NOT NULL,
  applicant_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verification_method TEXT,
  verification_contact TEXT,
  verified_by TEXT,
  notification_sent_at TIMESTAMPTZ,
  notification_message_id TEXT,
  terms_accepted_at TIMESTAMPTZ,
  terms_version TEXT,
  decision_notified_status TEXT CHECK (decision_notified_status IN ('verified', 'rejected')),
  decision_notification_sent_at TIMESTAMPTZ,
  decision_notification_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS notification_message_id TEXT;
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS decision_notified_status TEXT;
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS decision_notification_sent_at TIMESTAMPTZ;
ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS decision_notification_message_id TEXT;
CREATE INDEX IF NOT EXISTS retailer_applications_status_idx ON retailer_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS retailer_stores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES retailer_applications(user_id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  store_address TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  listed_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'rejected')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, store_address)
);
CREATE UNIQUE INDEX IF NOT EXISTS retailer_stores_primary_user_idx ON retailer_stores (user_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS retailer_stores_user_status_idx ON retailer_stores (user_id, status, created_at);
INSERT INTO retailer_stores (id, user_id, store_name, store_address, website, listed_phone, status, is_primary)
SELECT 'primary:' || user_id, user_id, store_name, store_address, website, listed_phone,
       CASE WHEN status = 'rejected' THEN 'rejected' ELSE 'verified' END, TRUE
FROM retailer_applications
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS retailer_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES retailer_applications(user_id) ON DELETE CASCADE,
  store_id TEXT REFERENCES retailer_stores(id) ON DELETE RESTRICT,
  store_name TEXT NOT NULL,
  store_address TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'reviewed' CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);
ALTER TABLE retailer_submissions ADD COLUMN IF NOT EXISTS store_id TEXT;
UPDATE retailer_submissions submissions
SET store_id = stores.id,
    payload = jsonb_set(submissions.payload, '{storeId}', to_jsonb(stores.id), true)
FROM retailer_stores stores
WHERE submissions.store_id IS NULL
  AND stores.user_id = submissions.user_id
  AND stores.is_primary = TRUE;
ALTER TABLE retailer_submissions ALTER COLUMN store_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE retailer_submissions
    ADD CONSTRAINT retailer_submissions_store_id_fkey
    FOREIGN KEY (store_id) REFERENCES retailer_stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS retailer_submissions_store_created_idx ON retailer_submissions (store_id, created_at DESC);
ALTER TABLE retailer_submissions ALTER COLUMN status SET DEFAULT 'reviewed';
CREATE INDEX IF NOT EXISTS retailer_submissions_user_created_idx ON retailer_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS retailer_submissions_status_created_idx ON retailer_submissions (status, created_at DESC);
UPDATE retailer_submissions
SET status = 'reviewed',
    payload = jsonb_set(payload, '{status}', '"reviewed"'::jsonb, true),
    reviewed_at = COALESCE(reviewed_at, created_at),
    reviewed_by = COALESCE(reviewed_by, 'retailer_direct')
WHERE status = 'pending_review';
