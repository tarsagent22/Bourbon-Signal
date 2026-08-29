# Community metadata storage decision

**Status:** Managed Postgres is the durable store for relational community and product interaction records; Clerk remains the identity and compact entitlement boundary.

## Current architecture

- Clerk owns authentication, verified contact factors, membership metadata, and privacy-safe public member identity.
- Managed Postgres stores normalized Community Sightings, votes/moderation state, alert queue/dedupe state, member collections, bottle contributions, recommendation feedback, and private Hunt Outcome records.
- Vercel Blob remains appropriate for append-light artifacts such as sighting photos and operational JSON, not relational voting, dedupe, moderation, or outcome aggregation.
- Clerk user IDs bind private rows to an account but are not rendered in public Signal or aggregate outcome responses.

## Decision

New relational member behavior must use the established Postgres repository and migration path. Do not reintroduce whole-document community records in Clerk metadata or Blob. Durable writes must preserve optimistic concurrency, idempotency, moderation, and tier enforcement at the server boundary.

Hunt Outcome is stored uniquely by member plus availability episode. The selected value, source type, state, and submitted/updated timestamps are private. Owner reporting may aggregate counts by source type, state, and time window, but must not expose respondent identity or member/store rankings. Individual outcomes never change Community standing, Signal validity, or availability episode behavior.

## Operational guardrails

1. Apply schema changes through the existing app-storage migration workflow.
2. Keep preview and production connection configuration separate and fail closed when durable storage is unavailable.
3. Include new relational tables in secure backup/export coverage before release.
4. Preserve Clerk as the authentication authority; never copy session secrets or verified contact factors into product tables.
5. Require explicit privacy and retention review before adding a new use of member-linked interaction data.
