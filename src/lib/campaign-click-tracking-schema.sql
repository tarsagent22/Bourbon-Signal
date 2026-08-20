CREATE TABLE IF NOT EXISTS campaign_email_clicks (
  campaign_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('points', 'trial', 'coverage', 'sightings')),
  first_clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  click_count INTEGER NOT NULL DEFAULT 1 CHECK (click_count > 0),
  PRIMARY KEY (campaign_id, recipient_hash, destination)
);

DO $migration$
DECLARE destination_constraint TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO destination_constraint
  FROM pg_constraint
  WHERE conrelid = 'campaign_email_clicks'::regclass
    AND conname = 'campaign_email_clicks_destination_check';

  IF destination_constraint IS NULL OR destination_constraint NOT LIKE '%coverage%' THEN
    ALTER TABLE campaign_email_clicks DROP CONSTRAINT IF EXISTS campaign_email_clicks_destination_check;
    ALTER TABLE campaign_email_clicks
      ADD CONSTRAINT campaign_email_clicks_destination_check
      CHECK (destination IN ('points', 'trial', 'coverage', 'sightings'));
  END IF;
END $migration$;

CREATE INDEX IF NOT EXISTS campaign_email_clicks_campaign_last_clicked_idx
  ON campaign_email_clicks (campaign_id, last_clicked_at DESC);
