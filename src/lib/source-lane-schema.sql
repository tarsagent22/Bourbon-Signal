-- Explicit additive migration only. Runtime never executes DDL.
CREATE TABLE IF NOT EXISTS source_lane_heads (
 source_id text PRIMARY KEY, generation bigint NOT NULL DEFAULT 0,
 revision bigint NOT NULL DEFAULT 0, lease_owner text, lease_until timestamptz,
 next_due_at timestamptz NOT NULL DEFAULT '-infinity', failures integer NOT NULL DEFAULT 0,
 healthy boolean NOT NULL DEFAULT false, last_reason text, accepted_at timestamptz
);
CREATE TABLE IF NOT EXISTS source_lane_batches (
 source_id text NOT NULL REFERENCES source_lane_heads(source_id), run_id text NOT NULL,
 revision bigint NOT NULL, digest text NOT NULL, observed_at timestamptz NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(), policy_id text NOT NULL,
 accounting jsonb NOT NULL, PRIMARY KEY(source_id,run_id), UNIQUE(source_id,revision)
);
CREATE TABLE IF NOT EXISTS source_lane_subjects (
 source_id text NOT NULL REFERENCES source_lane_heads(source_id), subject_id text NOT NULL,
 payload jsonb NOT NULL, PRIMARY KEY(source_id,subject_id)
);
CREATE TABLE IF NOT EXISTS source_lane_opportunities (
 episode_id text PRIMARY KEY, source_id text NOT NULL REFERENCES source_lane_heads(source_id),
 subject_id text NOT NULL, revision bigint NOT NULL, run_id text NOT NULL,
 observed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 closed boolean NOT NULL DEFAULT false, payload jsonb NOT NULL,
 FOREIGN KEY(source_id,run_id) REFERENCES source_lane_batches(source_id,run_id)
);
CREATE INDEX IF NOT EXISTS source_lane_opportunities_due_idx ON source_lane_opportunities(source_id,closed,expires_at);
CREATE TABLE IF NOT EXISTS source_lane_demand (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), payload jsonb NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS source_lane_trace (
 episode_id text NOT NULL REFERENCES source_lane_opportunities(episode_id), stage text NOT NULL,
 channel text NOT NULL DEFAULT '', first_at timestamptz NOT NULL, last_at timestamptz NOT NULL,
 samples bigint NOT NULL DEFAULT 1, PRIMARY KEY(episode_id,stage,channel),
 CHECK(stage IN ('considered','reserved','provider_attempt','provider_accepted','provider_failed','onsite_committed')),
 CHECK(channel IN ('','email','sms','push','onSite'))
);

CREATE OR REPLACE FUNCTION source_lane_acquire(p_source text,p_owner text,p_now timestamptz)
RETURNS SETOF source_lane_heads LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO source_lane_heads(source_id) VALUES(p_source) ON CONFLICT DO NOTHING;
 RETURN QUERY UPDATE source_lane_heads SET generation=generation+1, lease_owner=p_owner,
 lease_until=p_now+interval '45 seconds'
 WHERE source_id=p_source AND next_due_at<=p_now AND (lease_until IS NULL OR lease_until<=p_now)
 RETURNING *;
END $$;

-- One server-side transaction, safe over Neon HTTP: lock then validate then write.
CREATE OR REPLACE FUNCTION source_lane_commit(p_source text,p_owner text,p_generation bigint,p_revision bigint,
 p_run text,p_digest text,p_now timestamptz,p_policy text,p_subjects jsonb,p_opportunities jsonb,p_accounting jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE h source_lane_heads; b source_lane_batches; s jsonb; o jsonb;
BEGIN
 SELECT * INTO h FROM source_lane_heads WHERE source_id=p_source FOR UPDATE;
 SELECT * INTO b FROM source_lane_batches WHERE source_id=p_source AND run_id=p_run;
 IF FOUND THEN
   IF b.digest<>p_digest THEN RAISE EXCEPTION 'replay_conflict'; END IF;
   RETURN b.revision;
 END IF;
 IF h.source_id IS NULL OR h.lease_owner IS DISTINCT FROM p_owner OR h.generation<>p_generation
 OR h.revision<>p_revision OR h.lease_until<=p_now OR h.lease_until<=clock_timestamp() THEN
   RAISE EXCEPTION 'source_fenced';
 END IF;
 IF jsonb_array_length(p_subjects)>40 OR jsonb_array_length(p_opportunities)>40
 OR (p_accounting->>'expected')::int<>(p_accounting->>'inspected')::int THEN RAISE EXCEPTION 'scope_incomplete'; END IF;
 INSERT INTO source_lane_batches(source_id,run_id,revision,digest,observed_at,policy_id,accounting)
 VALUES(p_source,p_run,h.revision+1,p_digest,p_now,p_policy,p_accounting);
 FOR s IN SELECT * FROM jsonb_array_elements(p_subjects) LOOP
   IF EXISTS(SELECT 1 FROM source_lane_subjects WHERE source_id=p_source AND subject_id=s->>'id'
    AND (payload->>'observedAt')::timestamptz>=(s->>'observedAt')::timestamptz) THEN RAISE EXCEPTION 'observation_not_newer'; END IF;
   INSERT INTO source_lane_subjects(source_id,subject_id,payload) VALUES(p_source,s->>'id',s)
   ON CONFLICT(source_id,subject_id) DO UPDATE SET payload=EXCLUDED.payload;
   UPDATE source_lane_opportunities SET closed=true WHERE source_id=p_source AND subject_id=s->>'id'
    AND (s->>'state'='unavailable' OR episode_id IS DISTINCT FROM s->>'episodeId'
      -- Current canonical policy may withdraw eligibility while stock remains
      -- available. Close the opportunity, never fabricate a negative/new episode.
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_opportunities) current_op
        WHERE current_op->>'sourceSubjectId'=s->>'id'
          AND current_op->>'availabilityEpisodeId'=s->>'episodeId'));
 END LOOP;
 FOR o IN SELECT * FROM jsonb_array_elements(p_opportunities) LOOP
   INSERT INTO source_lane_opportunities(episode_id,source_id,subject_id,revision,run_id,observed_at,expires_at,payload)
   VALUES(o->>'availabilityEpisodeId',p_source,o->>'sourceSubjectId',h.revision+1,p_run,
     (o->>'observedAt')::timestamptz,(o->>'sourceExpiresAt')::timestamptz,o)
   ON CONFLICT(episode_id) DO UPDATE SET revision=EXCLUDED.revision,run_id=EXCLUDED.run_id,
    payload=EXCLUDED.payload || jsonb_build_object(
      'observedAt',source_lane_opportunities.payload->'observedAt',
      'signalAt',source_lane_opportunities.payload->'signalAt',
      'sourceExpiresAt',source_lane_opportunities.payload->'sourceExpiresAt')
   WHERE NOT source_lane_opportunities.closed;
 END LOOP;
 UPDATE source_lane_heads SET revision=h.revision+1,lease_owner=NULL,lease_until=NULL,
 next_due_at=p_now+interval '5 minutes',healthy=(p_accounting->>'unknown')::int=0,
 failures=0,last_reason=CASE WHEN (p_accounting->>'unknown')::int=0 THEN 'accepted' ELSE 'unknown_subject' END,
 accepted_at=clock_timestamp() WHERE source_id=p_source;
 RETURN h.revision+1;
END $$;
