# Dependable source polling and recovery

Prepared from the October 8 production audit and the Astra evaluation session.

## Scheduling and publication

The database holds due times, fenced 90-second leases, attempt records, source incidents and last accepted projections. A five-minute Vercel trigger collects due sources concurrently; each commits independently. An independent ten-minute GitHub monitor measures overdue work and rescues missed jobs. It uses a dedicated capability that cannot invoke customer notification delivery. Existing SC per-subject polling runs alongside it. The national snapshot remains the coherent catalog/policy authority, with a seven-day maximum policy age; each source has its own shorter evidence expiry.

The first durable registry repairs existing NC board shipments, Florida ABC, the three audited San Diego retailers, and the Ohio browser-artifact dependency. Other markets retain the guarded national refresh and watchdog. This release does not establish a measured nationwide scheduling SLA.

Retries are bounded to two transient attempts per worker and a 50-second collection deadline. Rate-limit responses honor Retry-After; identity/schema failures pause six hours, missing browser dependencies pause one hour, and repeated transient failures pause one hour. Due times and pauses survive restarts. Expired leases recover automatically and stale generations cannot commit. Pauses end in source recovery probes. Accepted-empty results replace owned alert candidates without restoring stale stock. Historical feed rows retain chronology with alerts disabled.

## Signal safety and alerts

Partial state degradation no longer vetoes healthy, validated siblings. Exact bottle, store/board identity, availability semantics, freshness, lifecycle, deduplication, member preferences, quiet hours and notification volume controls remain enforced. Routine Florida/California checks report missing positive inventory independently; strict admission checks remain available with --require-complete. Saved runtime candidates recheck current catalog and global quarantine authority before provider calls.

NC board shipments use their official extract timestamp and explicit board-level wording, never shelf-inventory wording. Board leads and official announcements have a seven-day maximum evidence age; SMS board leads retain the narrower 72-hour rule. Official dated release/lottery candidates require an identified bottle, future explicit release time or entry deadline, and stable event deduplication. NC structured Event records are parsed only after existing first-party identity validation; a drawing end time is not inferred to be an entry deadline. Generic/undated lottery pages remain silent. Feed structure and filtering are unchanged.

Source accounting records collection, accepted evidence, feed projections and alert candidates. Downstream traces separately record feed/candidate reads, consideration, reservations, onsite commitment and actual provider attempts/acceptance. A generated candidate is not a delivered notification or a successful hunt.

## Mobile

After login the app automatically saves the device IANA time zone, refreshes on app activation and detects changes while active. Failed saves retry silently with bounded backoff. Device registration also captures the time zone atomically with existing owner/member locking. Delivery metadata remains private. This is a JavaScript-only OTA change; no native build is required or authorized.

## Existing source limitations

- Florida ABC: validated positive rows survive missing positive inventory at other stores; immutable directory identity is still mandatory.
- California Del Mesa: fresh identity-bound orderability is independently publishable. Mission Trails returned 750 products with no safely matched available bourbon rows. Chips remains catalog evidence without verified local pickup. Neither condition blocks Del Mesa.
- NC: board shipment data can support county/board leads, while warehouse/undated event pages retain their distinct limitations. A board shipment does not prove a specific store shelf has stock.
- Ohio: the local signed browser worker reports provider access denial and cooldown. Dependency monitoring cannot restore inventory without authorized provider access and a valid fresh artifact; no security bypass was added.
- SC Liquor Library: reviewed the same first-party store's changed ZIP+4 and map pin; only the two exact audited identities are accepted.

Production deployment, source recovery, canonical feed evidence and OTA manifest proof must be recorded separately from physical-device notification receipt. Hunter-success measurement is deferred.
