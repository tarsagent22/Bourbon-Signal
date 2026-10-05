CREATE TABLE IF NOT EXISTS coverage_request_reviews (
 request_id TEXT PRIMARY KEY REFERENCES coverage_requests(id) ON DELETE CASCADE,
 internal_note TEXT NOT NULL DEFAULT '', member_update TEXT NOT NULL DEFAULT '',
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high')),
 actor_id TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS owner_workspace_audit (
 id BIGSERIAL PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS collection_price_history (
 id BIGSERIAL PRIMARY KEY, bottle_id TEXT NOT NULL, reference JSONB NOT NULL,
 actor_id TEXT NOT NULL, review_note TEXT NOT NULL, reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collection_price_history_latest ON collection_price_history(bottle_id, id DESC);

CREATE TABLE IF NOT EXISTS collection_price_health (
 day DATE PRIMARY KEY, summary JSONB NOT NULL, checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
