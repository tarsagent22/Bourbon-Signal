-- Additive, idempotent bootstrap. Apply before application cutover. Runtime is DML-only.
-- No Expo tokens or installation identifiers are persisted here: only domain-separated hashes.
create table if not exists member_push_ownership (
  resource_hash text primary key,
  user_id text not null,
  binding_id text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists member_push_ownership_member_idx on member_push_ownership(user_id);
