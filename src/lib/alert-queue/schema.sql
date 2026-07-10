begin;

create table if not exists engine_snapshots (
  snapshot_id text primary key,
  app_commit text not null,
  engine_commit text not null,
  collection_run_id text not null,
  generated_at timestamptz not null,
  activated_at timestamptz,
  manifest jsonb not null
);

create table if not exists alert_candidates (
  id text primary key,
  snapshot_id text not null references engine_snapshots(snapshot_id),
  user_id text not null,
  channel text not null check (channel in ('onSite', 'email', 'sms')),
  stable_match_key text not null,
  alert_window text not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'delivered', 'suppressed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  claimed_by text,
  claimed_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  failure_code text,
  unique (user_id, channel, stable_match_key, alert_window)
);

create index if not exists alert_candidates_pending_idx
  on alert_candidates (created_at, id)
  where status = 'pending';

create table if not exists alert_deliveries (
  id bigint generated always as identity primary key,
  candidate_id text not null references alert_candidates(id),
  attempt_number integer not null check (attempt_number > 0),
  provider_message_id text,
  status text not null check (status in ('attempted', 'delivered', 'failed', 'suppressed')),
  attempted_at timestamptz not null,
  completed_at timestamptz,
  error_code text,
  unique (candidate_id, attempt_number)
);

create table if not exists alert_baselines (
  id bigint generated always as identity primary key,
  user_id text not null,
  channel text not null check (channel in ('onSite', 'email', 'sms')),
  stable_match_key text not null,
  created_at timestamptz not null,
  reason text not null default 'migration_baseline',
  migration_id text,
  unique (user_id, channel, stable_match_key)
);

alter table alert_baselines add column if not exists migration_id text;

create table if not exists alert_lifecycle_states (
  user_id text not null,
  channel text not null check (channel in ('onSite', 'email', 'sms')),
  lifecycle_key text not null,
  last_observed_quantity numeric not null check (last_observed_quantity >= 0),
  last_observed_at timestamptz not null,
  last_alerted_quantity numeric not null check (last_alerted_quantity >= 0),
  last_alerted_at timestamptz not null,
  alert_version integer not null default 1 check (alert_version > 0),
  last_decision_reason text not null,
  unavailable_since timestamptz,
  primary key (user_id, channel, lifecycle_key)
);

create index if not exists alert_lifecycle_states_observed_idx
  on alert_lifecycle_states (last_observed_at);

create table if not exists clerk_alert_metadata_backups (
  migration_id text not null,
  user_id text not null,
  alert_delivery jsonb not null default '{}'::jsonb,
  alert_inbox jsonb not null default '{}'::jsonb,
  backed_up_at timestamptz not null default now(),
  primary key (migration_id, user_id)
);

create index if not exists clerk_alert_metadata_backups_user_idx
  on clerk_alert_metadata_backups (user_id, backed_up_at desc);

commit;
