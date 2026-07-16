CREATE TABLE IF NOT EXISTS retailer_prospects (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'discovered' CHECK (state IN (
    'discovered', 'qualified', 'contact_verified', 'draft_ready', 'awaiting_approval',
    'approved', 'contacted', 'follow_up_due', 'interested', 'onboarding', 'verified',
    'first_signal_live', 'paused', 'declined', 'invalid'
  )),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  listed_phone TEXT NOT NULL DEFAULT '',
  identity_key TEXT NOT NULL UNIQUE,
  location_key TEXT NOT NULL DEFAULT '',
  domain_key TEXT NOT NULL DEFAULT '',
  discovery_source TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  score NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  score_components JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_rationale JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome TEXT,
  initial_contact_count SMALLINT NOT NULL DEFAULT 0 CHECK (initial_contact_count BETWEEN 0 AND 1),
  follow_up_count SMALLINT NOT NULL DEFAULT 0 CHECK (follow_up_count BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS retailer_prospects_state_score_idx
  ON retailer_prospects (state, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS retailer_prospects_location_key_idx
  ON retailer_prospects (location_key) WHERE location_key <> '';
CREATE INDEX IF NOT EXISTS retailer_prospects_domain_key_idx
  ON retailer_prospects (domain_key) WHERE domain_key <> '';

CREATE TABLE IF NOT EXISTS retailer_prospect_contact_evidence (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'official_website_email', 'official_website_phone', 'official_contact_form', 'regulator_listing'
  )),
  source_url TEXT NOT NULL,
  contact_value TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prospect_id, kind, contact_value)
);

CREATE INDEX IF NOT EXISTS retailer_prospect_contact_evidence_prospect_idx
  ON retailer_prospect_contact_evidence (prospect_id, verified_at DESC);

CREATE TABLE IF NOT EXISTS retailer_prospect_message_versions (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'phone', 'contact_form')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prospect_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS retailer_prospect_one_approved_message_idx
  ON retailer_prospect_message_versions (prospect_id) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS retailer_prospect_approval_packets (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
  message_version_id TEXT NOT NULL REFERENCES retailer_prospect_message_versions(id) ON DELETE RESTRICT,
  packet JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_version_id)
);

CREATE TABLE IF NOT EXISTS retailer_prospect_outreach (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
  message_version_id TEXT NOT NULL REFERENCES retailer_prospect_message_versions(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'follow_up')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'phone', 'contact_form')),
  recorded_by TEXT NOT NULL,
  contacted_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prospect_id, kind)
);

-- PostgreSQL functions are transactions: every guard and write below commits together or rolls back together.
CREATE OR REPLACE FUNCTION approve_retailer_prospect_message(
  target_prospect_id TEXT,
  target_version INTEGER,
  target_message_id TEXT,
  target_packet_id TEXT,
  owner_id TEXT
) RETURNS retailer_prospect_message_versions AS $$
DECLARE
  approved_message retailer_prospect_message_versions;
BEGIN
  PERFORM 1 FROM retailer_prospects
  WHERE id = target_prospect_id AND state = 'awaiting_approval'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect is not awaiting approval';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM retailer_prospect_contact_evidence
    WHERE prospect_id = target_prospect_id AND verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verified official contact evidence is required';
  END IF;

  UPDATE retailer_prospect_message_versions
  SET status = 'superseded'
  WHERE prospect_id = target_prospect_id AND status = 'approved';

  UPDATE retailer_prospect_message_versions
  SET status = 'approved', approved_by = owner_id, approved_at = NOW()
  WHERE id = target_message_id
    AND prospect_id = target_prospect_id
    AND version = target_version
    AND status = 'draft'
  RETURNING * INTO approved_message;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft message version was not found';
  END IF;

  INSERT INTO retailer_prospect_approval_packets (
    id, prospect_id, message_version_id, packet, approved_by
  )
  SELECT target_packet_id, prospects.id, approved_message.id,
    jsonb_build_object(
      'prospectId', prospects.id,
      'retailer', jsonb_build_object(
        'name', prospects.name, 'address', prospects.address, 'city', prospects.city,
        'state', prospects.region, 'postalCode', prospects.postal_code,
        'website', prospects.website, 'listedPhone', prospects.listed_phone
      ),
      'score', prospects.score,
      'scoreComponents', prospects.score_components,
      'scoreInputs', prospects.score_inputs,
      'scoreRationale', prospects.score_rationale,
      'messageVersion', approved_message.version,
      'message', jsonb_build_object(
        'channel', approved_message.channel, 'subject', approved_message.subject, 'body', approved_message.body
      ),
      'officialContactEvidence', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', evidence.kind, 'sourceUrl', evidence.source_url,
          'contactValue', evidence.contact_value, 'capturedAt', evidence.captured_at,
          'verifiedAt', evidence.verified_at
        ) ORDER BY evidence.captured_at DESC)
        FROM retailer_prospect_contact_evidence evidence
        WHERE evidence.prospect_id = prospects.id AND evidence.verified_at IS NOT NULL
      ), '[]'::jsonb),
      'guardrails', jsonb_build_array(
        'Owner approval applies only to this exact message version.',
        'No outreach may be recorded from a draft or superseded version.',
        'At most one follow-up may be recorded.',
        'Demand and outcomes remain aggregate; do not add identities or invented reach claims.'
      )
    ), owner_id
  FROM retailer_prospects prospects
  WHERE prospects.id = target_prospect_id;

  UPDATE retailer_prospects SET state = 'approved', updated_at = NOW()
  WHERE id = target_prospect_id;
  RETURN approved_message;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_retailer_prospect_outreach(
  outreach_id TEXT,
  target_prospect_id TEXT,
  target_message_version_id TEXT,
  outreach_kind TEXT,
  outreach_channel TEXT,
  owner_id TEXT,
  contact_time TIMESTAMPTZ,
  outreach_note TEXT
) RETURNS retailer_prospect_outreach AS $$
DECLARE
  prospect retailer_prospects;
  recorded retailer_prospect_outreach;
BEGIN
  SELECT * INTO prospect FROM retailer_prospects
  WHERE id = target_prospect_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prospect was not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM retailer_prospect_message_versions message_versions
    WHERE message_versions.id = target_message_version_id
      AND message_versions.prospect_id = target_prospect_id
      AND message_versions.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Outreach requires an approved message version';
  END IF;

  IF outreach_kind = 'initial' THEN
    IF prospect.state <> 'approved' OR prospect.initial_contact_count <> 0 THEN
      RAISE EXCEPTION 'Initial outreach is not allowed';
    END IF;
  ELSIF outreach_kind = 'follow_up' THEN
    IF prospect.state <> 'follow_up_due'
       OR prospect.initial_contact_count <> 1
       OR prospect.follow_up_count >= 1 THEN
      RAISE EXCEPTION 'Only one follow-up is allowed when follow-up is due';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown outreach kind';
  END IF;

  INSERT INTO retailer_prospect_outreach (
    id, prospect_id, message_version_id, kind, channel, recorded_by, contacted_at, note
  ) VALUES (
    outreach_id, target_prospect_id, target_message_version_id, outreach_kind,
    outreach_channel, owner_id, contact_time, outreach_note
  ) RETURNING * INTO recorded;

  UPDATE retailer_prospects
  SET state = 'contacted',
      initial_contact_count = CASE WHEN outreach_kind = 'initial' THEN 1 ELSE initial_contact_count END,
      follow_up_count = CASE WHEN outreach_kind = 'follow_up' THEN follow_up_count + 1 ELSE follow_up_count END,
      updated_at = NOW()
  WHERE id = target_prospect_id;
  RETURN recorded;
END;
$$ LANGUAGE plpgsql;
