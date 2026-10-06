CREATE TABLE IF NOT EXISTS community_member_blocks (
  user_id text NOT NULL,
  blocked_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, blocked_user_id),
  CHECK(user_id <> blocked_user_id)
);
CREATE TABLE IF NOT EXISTS community_abuse_reports (
  user_id text NOT NULL,
  sighting_id text NOT NULL,
  reason text NOT NULL CHECK(reason IN ('spam','misleading','harassment','inappropriate','other')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  PRIMARY KEY(user_id, sighting_id)
);
CREATE INDEX IF NOT EXISTS community_abuse_reports_queue ON community_abuse_reports(status, created_at);
