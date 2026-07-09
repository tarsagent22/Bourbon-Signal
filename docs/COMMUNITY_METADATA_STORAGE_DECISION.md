# Community metadata storage decision

**Status:** Keep current Clerk metadata storage for now; do not perform a disruptive migration without a provisioned relational database.

## Evidence

- Identity, entitlement, alert preference, sightings, votes, collection, and contribution paths currently share Clerk user metadata and Clerk server APIs.
- Vercel Blob is already provisioned, but the current Blob uses are append-light artifacts: sighting photos, the missing-bottle queue, and operational heartbeat JSON.
- No relational database client, migration framework, or `DATABASE_URL`-style environment contract exists in the repository.

## Decision

Do not move community records into Vercel Blob. Blob JSON would preserve deployment compatibility but make concurrent votes, dedupe, moderation, indexing, and transactional updates less reliable than the current implementation. It would exchange Clerk's scaling ceiling for race conditions and whole-document rewrites.

Do not introduce Neon, Supabase, or another relational provider inside an operational-hardening release. Provisioning, schema migration, dual writes, backfill verification, rollback, privacy controls, and production monitoring are required before that change can be called zero-disruption.

Clerk remains the identity and compact entitlement store. Existing community metadata remains in place until a relational migration is deliberately funded and staged.

## Migration trigger and target

Start the relational migration when any of these is true:

- sightings aggregation approaches the current 100-user scan ceiling;
- metadata write contention or size limits appear in production;
- moderation, vote, inbox, dedupe, or collection queries need cross-user indexes;
- a managed Postgres environment is provisioned for preview and production.

The target should be managed Postgres with normalized tables for sightings, votes, alert inbox/dedupe, collections, and contribution review. Use dual writes, checksummed backfill, read comparison, and a reversible cutover. Keep Clerk user IDs as foreign identity keys and retain only compact entitlement metadata in Clerk.
