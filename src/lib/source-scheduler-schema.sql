CREATE TABLE IF NOT EXISTS source_poll_jobs (
 source_id text PRIMARY KEY, cadence_seconds int NOT NULL CHECK(cadence_seconds>=300),
 next_due_at timestamptz NOT NULL DEFAULT now(), lease_owner text, lease_until timestamptz,
 generation bigint NOT NULL DEFAULT 0, failures int NOT NULL DEFAULT 0,
 paused_until timestamptz, last_started_at timestamptz, last_completed_at timestamptz,
 last_reason text, projection jsonb, accepted_at timestamptz
);
CREATE TABLE IF NOT EXISTS source_poll_runs (
 run_id text PRIMARY KEY, source_id text NOT NULL REFERENCES source_poll_jobs,
 generation bigint NOT NULL, due_at timestamptz NOT NULL, started_at timestamptz NOT NULL,
 finished_at timestamptz, status text NOT NULL, accounting jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS source_poll_runs_recent ON source_poll_runs(source_id,started_at DESC);
CREATE TABLE IF NOT EXISTS source_poll_incidents (
 source_id text NOT NULL REFERENCES source_poll_jobs, reason text NOT NULL,
 first_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now(),
 occurrences int NOT NULL DEFAULT 1, resolved_at timestamptz, PRIMARY KEY(source_id,reason)
);
CREATE TABLE IF NOT EXISTS source_scheduler_heartbeat (
 name text PRIMARY KEY, checked_at timestamptz NOT NULL, payload jsonb NOT NULL
);
CREATE OR REPLACE FUNCTION source_poll_acquire(p_source text,p_owner text,p_cadence int)
RETURNS SETOF source_poll_jobs LANGUAGE plpgsql AS $$
DECLARE j source_poll_jobs;
BEGIN
 INSERT INTO source_poll_jobs(source_id,cadence_seconds) VALUES(p_source,p_cadence) ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM source_poll_jobs WHERE source_id=p_source FOR UPDATE;
 IF j.next_due_at>clock_timestamp() OR j.lease_until>clock_timestamp() OR j.paused_until>clock_timestamp() THEN RETURN; END IF;
 UPDATE source_poll_runs SET finished_at=clock_timestamp(),status='lease_expired'
 WHERE source_id=p_source AND status='running';
 RETURN QUERY UPDATE source_poll_jobs SET generation=generation+1,lease_owner=p_owner,
 lease_until=clock_timestamp()+interval '90 seconds',last_started_at=clock_timestamp(),cadence_seconds=p_cadence
 WHERE source_id=p_source RETURNING *;
 INSERT INTO source_poll_runs(run_id,source_id,generation,due_at,started_at,status)
 SELECT p_owner,p_source,generation,next_due_at,last_started_at,'running' FROM source_poll_jobs WHERE source_id=p_source;
END $$;
CREATE OR REPLACE FUNCTION source_poll_finish(p_source text,p_owner text,p_generation bigint,p_projection jsonb,
 p_reason text,p_backoff int,p_pause int,p_accounting jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE j source_poll_jobs;
BEGIN
 SELECT * INTO j FROM source_poll_jobs WHERE source_id=p_source FOR UPDATE;
 IF j.lease_owner IS DISTINCT FROM p_owner OR j.generation<>p_generation OR j.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 UPDATE source_poll_jobs SET lease_owner=NULL,lease_until=NULL,last_completed_at=clock_timestamp(),last_reason=p_reason,
 failures=CASE WHEN p_projection IS NOT NULL THEN 0 ELSE LEAST(failures+1,30) END,
 next_due_at=clock_timestamp()+make_interval(secs=>CASE WHEN p_projection IS NOT NULL THEN cadence_seconds ELSE p_backoff END),
 paused_until=CASE WHEN p_pause>0 THEN clock_timestamp()+make_interval(secs=>p_pause) ELSE NULL END,
 projection=COALESCE(p_projection,projection),accepted_at=CASE WHEN p_projection IS NOT NULL THEN clock_timestamp() ELSE accepted_at END
 WHERE source_id=p_source;
 UPDATE source_poll_runs SET finished_at=clock_timestamp(),status=p_reason,accounting=p_accounting WHERE run_id=p_owner;
 IF p_projection IS NULL THEN
   INSERT INTO source_poll_incidents(source_id,reason) VALUES(p_source,p_reason)
   ON CONFLICT(source_id,reason) DO UPDATE SET last_at=clock_timestamp(),occurrences=source_poll_incidents.occurrences+1,resolved_at=NULL;
 ELSE
   UPDATE source_poll_incidents SET resolved_at=clock_timestamp() WHERE source_id=p_source AND resolved_at IS NULL;
 END IF;
 RETURN true;
END $$;

CREATE TABLE IF NOT EXISTS source_poll_trace (
 source_id text NOT NULL REFERENCES source_poll_jobs,stage text NOT NULL,channel text NOT NULL DEFAULT '',
 last_at timestamptz NOT NULL,row_count int NOT NULL,PRIMARY KEY(source_id,stage,channel)
);
