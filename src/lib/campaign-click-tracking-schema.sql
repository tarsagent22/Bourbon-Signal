CREATE TABLE IF NOT EXISTS campaign_email_clicks (
  campaign_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('points', 'trial')),
  first_clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  click_count INTEGER NOT NULL DEFAULT 1 CHECK (click_count > 0),
  PRIMARY KEY (campaign_id, recipient_hash, destination)
);

CREATE INDEX IF NOT EXISTS campaign_email_clicks_campaign_last_clicked_idx
  ON campaign_email_clicks (campaign_id, last_clicked_at DESC);
