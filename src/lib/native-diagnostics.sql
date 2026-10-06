CREATE TABLE IF NOT EXISTS native_render_diagnostics (
 user_id text NOT NULL, bucket timestamptz NOT NULL, slot integer NOT NULL CHECK(slot BETWEEN 0 AND 9),
 fingerprint text NOT NULL, metadata jsonb NOT NULL, occurrences integer NOT NULL DEFAULT 1 CHECK(occurrences BETWEEN 1 AND 100),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,bucket,slot), UNIQUE(user_id,bucket,fingerprint)
);
CREATE INDEX IF NOT EXISTS native_render_diagnostics_recent ON native_render_diagnostics(last_seen_at);
