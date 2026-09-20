-- M12 additive migration. Apply explicitly before enabling the worker. No runtime DDL.
-- The outbox and receipt ledger contain no Expo tokens, installation IDs, or message payloads.
create table if not exists alert_push_outbox (
  id text primary key,
  user_id text not null,
  alert_id text not null,
  stable_keys text[] not null check (cardinality(stable_keys) > 0),
  status text not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reason text,
  unique (user_id, stable_keys)
);
alter table alert_push_outbox drop constraint if exists alert_push_outbox_status_check;
alter table alert_push_outbox add constraint alert_push_outbox_status_check
  check (status in ('pending','unknown','accepted','delivered','rejected','suppressed','expired','exhausted'));
create index if not exists alert_push_outbox_pending on alert_push_outbox (user_id,next_attempt_at) where status='pending';

create table if not exists alert_push_tickets (
  provider_ticket_id text primary key,
  outbox_id text not null references alert_push_outbox(id),
  user_id text not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  installation_hash text not null check (installation_hash ~ '^[0-9a-f]{64}$'),
  binding_id text not null,
  status text not null default 'pending' check (status in ('pending','delivered','rejected','unknown')),
  receipt_attempt_count integer not null default 0 check (receipt_attempt_count between 0 and 5),
  next_receipt_at timestamptz not null,
  accepted_at timestamptz not null,
  resolved_at timestamptz,
  poll_owner text,
  poll_lease_expires_at timestamptz,
  reason text,
  updated_at timestamptz not null default now(),
  unique (outbox_id, token_hash, binding_id)
);
create index if not exists alert_push_tickets_pending on alert_push_tickets (next_receipt_at,accepted_at) where status='pending';
create index if not exists alert_push_tickets_user on alert_push_tickets (user_id,status);
