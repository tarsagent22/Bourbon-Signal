# New Jersey and Michigan candidate boundary

This preparation admits only four reviewed New Jersey premises and one reviewed
Michigan premise. Ten other discovery premises and the separate Wine Palace
native fallback remain outside the candidate, canary and production cohorts.
The earlier broad-discovery runs do not fulfill the changed cohort's promotion
requirements.

Authoritative lifecycle remains `research_only`; source configurations remain
`active:false`. Production entry points require the exact source/cohort manifest,
three successful source shadows, two successful canaries, an owned preview and
matching immutable workflow provenance before any cache read or HTTP. All
inventory/watch/delivery/email/SMS eligibility remains false. Fresh qualifying
rows may eventually appear on site only after a separate reviewed activation.

The production collector performs one reviewed search per premise, at most four
requests in NJ (60-second source/120-second parent budget) and one request in MI
(20-second source/60-second parent budget). First-party merchant, address,
coordinates, option, product identity and positive pickup offer must agree.
Shelf quantity remains zero with unknown exact quantity. Thirty-minute cache
replay retains each original response clock and rechecks the current library.

The production and candidate research transports observe 401/403/429/435 at
native response headers before body reads or cancellation. Atomic incident-only
pre-request latches and denial journals survive failed writes or publication.
Denials retain at least 24 hours, and longer Retry-After values. Research zero
value still parks the host for review. Existing journals are never reset by a
cohort change; unreadable/malformed files block HTTP. Production workflow
restores and always saves its separate incident directory.

Local validation exercises the actual nonpreview runtime, normalization,
classification, Feed route, exact-store Feed filters, Coverage GET/POST, Finder
directory and location routes, and store preference scopes using explicitly
synthetic promotion and HTTP fixtures. NJ has four synthetic positive stores;
MI has one. These are implementation checks, not source, customer-delivery or
promotion evidence. Authoritative inactive calls, including forced collection,
make zero requests. Source freshness, identity, shipping, stale fallback,
notifications and denial-write failures have negative checks.

Integration prerequisites before a new source freeze:

- Reuse the exact shared `central-cityhive-transport.mjs` from commit `7ab5ad63`.
- Add NJ/MI's dedicated reusable research job and existing incident-file cache
  routing to the common shadow workflow; preserve its unconditional incident save.
- Add `isNjMiResearchSourceInventory` to shared shadow readiness only as a strict
  pure source-evidence predicate. It requires every notification/customer flag
  false and cannot admit a row to customer visibility.
- Merge the separately supplied NJ/MI downloader, preparer and verifier routing
  and mandatory source hashes into the common canary/provenance workflows.
- Run three fresh candidate-only hosted shadows on the final integrated source
  head, then two canaries per state, owned previews and workflow-issued proof.

No source HTTP, preview deployment, main PR or lifecycle activation was performed
for this production preparation commit.
