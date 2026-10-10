CREATE TABLE IF NOT EXISTS member_bottle_mutes (
  user_id TEXT PRIMARY KEY,
  bottles JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bottles)='array'),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
