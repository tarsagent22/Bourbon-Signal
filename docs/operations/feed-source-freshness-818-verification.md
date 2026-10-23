# Feed source freshness verification

The normal Drop Feed must compose mutable source results after reading its cached immutable engine snapshot. A generation change, collection failure, source-reader error, explicit disable, expiration, or policy loss must take effect on the next server read. A previously accepted cached row cannot substitute for current source authority. Normal feed and coverage responses must prevent intermediary reuse with `Cache-Control: private, no-store`.

Run the independent route regression with:

```powershell
node node_modules/tsx/dist/cli.mjs --test scripts/test-feed-source-freshness.mts
```

The test transpiles the saved Drop Feed route and saved source runtime wrapper in memory. It retains immutable cached preparation across consecutive requests and an idle interval, uses the real poll projection and authority policies, and supplies deterministic source-reader and infrastructure fixtures. It checks generation advancement, failure and recovery, reader exceptions, narrow disable with the global scheduler off, unchanged-generation expiration, catalog and state-policy loss, receipt consistency, preservation of unrelated degraded-state filtering, SC lane rereads, and normal guest/member/coverage cache headers. Frozen input rows and forbidden-access counters detect mutation and unexpected infrastructure, collector, or write calls even when caught by the consumer.

The performance regression issues twenty concurrent reads against one immutable snapshot. The broad read and unchanged-row normalization/classification must occur once, while current source policy is read twenty times. Reusing expensive immutable work must not reuse a mutable availability decision. These are deterministic behavioral checks, not production latency measurements or physical shelf confirmation.

Server response freshness does not revoke a response already displayed on a device or retained in client memory. Existing browser/mobile response caches and physical-device refresh behavior require separate acceptance. Source-reported online orderability, general retailer pickup policy, exact variant/store pickup offers, and physical on-hand counts remain distinct evidence classes.

## Five new physical premises across at least three states

Freeze a timestamped, immutable baseline before counting expansion results. Record the production commit/snapshot, registered source footprint, current and stale inventory-connected premises, historical published inventory identities, and directory-only locations. Keep the following counts separate:

| Count | Qualification |
| --- | --- |
| Reused connector or parser | Existing collection capability reused for preparation; does not itself add a store. |
| Recovered connection | A previously connected premise becomes healthy again; report recovery separately. |
| Net-new inventory connection | A premise with no prior inventory connection gains current source-backed customer results. An existing directory entry can qualify, with directory reuse disclosed. |
| Newly discovered directory identity | New searchable location metadata; does not establish bottle availability or count toward the five connections. |

The target is five distinct net-new inventory-connected physical premises represented in at least three states. Existing Mission Trails and Jensen connections, renamed source IDs, old connections that are merely stale, several bottles at one address, and the same premise exposed through several storefronts/platforms do not count as additional new premises.

Deduplicate against the baseline and within the candidate batch using the full physical address, state, city/ZIP, reviewed merchant/store identity, and platform aliases. Resolve common address abbreviations, URL/host aliases, store renames, suites, and duplicate platform merchant IDs. Preserve an explicit premises-to-source alias table. Ambiguous co-located or relocated stores remain pending rather than increasing the count. Distinct branches at independently verified addresses can count separately. Report gross additions, reused/recovered premises, duplicates removed, and the resulting net-new count.

Every counted premise must have all of the following:

- Verified first-party source, physical premises, canonical bottle/product/variant binding, truthful fulfillment evidence, price where published, and binary-versus-exact quantity semantics. Catalog, shipping, directory, release-calendar, board/warehouse, and shipment evidence remain separate from exact-store current availability.
- At least two genuinely due unattended accepted runs with distinct immutable run IDs and advancing generations, due clocks, and observation times. Manual probes, rescue dispatches, due resets, and same-response replays cannot replace those runs.
- Contemporaneous normal customer feed and coverage evidence for that exact source/store/bottle and current generation. A state aggregate or a signed verification endpoint alone cannot establish that normal responses bypassed a stale intermediary cache.
- A latest capture that remains enabled, accepted, failure-free, and healthy for the selected source, with matching current trace and nonzero current feed/coverage identities. Older healthy captures cannot hide a newer failure, pending run, unavailable read, missing health, or missing receipt.
- Correct negatives and loss of authority: recognized out-of-stock remains a healthy negative; unknown schemas and denials are failures. Expired, disabled, failed, or policy-rejected evidence must lose current inventory/alert eligibility, without restoring an older snapshot or suppressing unrelated valid stores.
- Measured request/byte/time budgets, persistent cadence and backoff, fenced leases, independent monitoring, and a tested narrow rollback. No access-denial workaround or retry loop may be used to satisfy the target.
- Stable alert episode/deduplication proof. Bootstrap candidates must be zero. Retained projection candidates are not new queue emissions. Where projections are nonzero, use immutable per-generation current-at-capture key mappings and aggregate owned-key queue/delivery evidence; unknown mappings or nonzero unexplained counts remain pending. A whole-window audit should cover the cadence gaps as well as individual post-run windows.

Do not declare the batch accepted until all five net-new premises are simultaneously supported by current eligible results, the state count is at least three, and the deduplication and maintenance checks pass. A source can be functioning while a specific bottle is out of stock; report that separately, and retain additional successful positive runs needed to demonstrate the customer result path.

Two due cycles establish an initial pilot. A recommended observation period is 24–48 hours before broader rollout, with the actual run history retained throughout. Review successful/failed runs, current result consistency, negative transitions when naturally observed, deduplication, maintenance cost, monitoring, and rollback over that interval. Do not manufacture a stock transition, a zero queue count, or an uninterrupted health claim. A batch that has passed only the initial cycles should be labeled initial pilot acceptance, with the longer observation still pending.
