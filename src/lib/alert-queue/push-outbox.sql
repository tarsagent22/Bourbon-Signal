-- M12 additive migration. Apply explicitly before enabling the worker. No runtime DDL.
-- Deliberately independent of inbox/email/SMS and contains NO tokens or provider payload.
create table if not exists alert_push_outbox (
  id text primary key,
  user_id text not null,
  alert_id text not null,
  stable_keys text[] not null check (cardinality(stable_keys) > 0),
  status text not null default 'pending' check (status in ('pending','unknown','accepted','suppressed','expired','exhausted')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reason text,
  unique (user_id, stable_keys)
);
create index if not exists alert_push_outbox_pending on alert_push_outbox (user_id,next_attempt_at) where status='pending';
