-- Apply before deploying per-location verification. Additive and replay-safe:
-- existing verified stores and historical submissions are deliberately retained.
-- The canonical app-storage migration supplies the transaction boundary.
ALTER TABLE retailer_stores DROP CONSTRAINT IF EXISTS retailer_stores_status_check;
ALTER TABLE retailer_stores ADD CONSTRAINT retailer_stores_status_check CHECK (status IN ('pending', 'verified', 'rejected'));
ALTER TABLE retailer_stores ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE retailer_stores ADD COLUMN IF NOT EXISTS verification_method TEXT;
ALTER TABLE retailer_stores ADD COLUMN IF NOT EXISTS verification_contact TEXT;
ALTER TABLE retailer_stores ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE retailer_stores ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

