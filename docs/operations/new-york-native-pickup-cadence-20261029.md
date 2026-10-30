# New York native pickup healthy cadence

Prepared offline from main `9a6e0ec0`. No retailer/provider HTTP, publication,
environment or operational-control changes were performed. This is a scheduling
repair, not a current-stock or new-store result.

The exact NY attempt ledger in successful production artifact `40949342705`
retained five native Shopify pickup successes from about 19:35 UTC with
`httpStatus:null` and `nextAllowedAt` about 23:35 UTC. Its four-hour retry cadence
exceeded the existing two-hour public inventory TTL. A later full-fleet run on
old main can legitimately retain these timers; force-all state selection does
not enable `NY_FORCE_METRO_LIVE`. This patch does not claim that run restored NY.

The five frozen registered native sources now expose a healthy 30-minute cadence
through the existing `depthDiscovery.refreshCadenceMs` hook. No source URL,
premise, product/variant, parser, source permission, public TTL or library changes.
Cloned/same-ID/foreign descriptors cannot trigger the legacy migration.

Only a valid existing success with explicit null HTTP, exactly the four canonical
attempt fields and exactly the old four-hour interval is migrated. Its
`lastAttemptAt` remains unchanged; only next eligibility becomes original last
attempt +30 minutes. Cached inventory observations are never re-aged. Future
genuine successful native callbacks use 30 minutes. Failed, timed-out, malformed,
collapsed, quarantined or explicit HTTP results retain the former unconfigured
NY fallback. Denial normalization, longer persisted holds, selection/force logic,
runner retry behavior and other states stay unchanged.

Unknown attempt metadata is retained for these five sources, preventing a
read/write roundtrip from stripping a hold marker and accidentally qualifying
it for migration later. A same-source roadblock preserves a migration veto until
a genuine later network result replaces that attempt; checkpoint/circuit skips
cannot clear it. Nothing accelerates the legacy 403 siblings.

The unmodified archived ledger is the offline fixture
`engine/test/fixtures/new-york-native-cadence-40949342705/NY.json`, SHA256
`89553255f4da62910fe534a3e676a19ae7bdf835f3c9fa472d616096fca66eee`.
Sibling production denials remain present. `provenance.json` records its actual
workflow/artifact identity, not fabricated source observations.

Nine-state noninterference was checked in a separate disposable checkout of
frozen `b2f310a9f270993bad8bcab5054e0e452f0b8c3e`. Fresh processes imported actual
WA/NM/WI/OK/LA/AK/MA/CT/RI runtime metadata, cohort keys and semantic source-config
hashes before and after overlaying only the two scheduling modules. All 27
hashes remained identical. All 175 checked-in issuer-path-union digests also
remained identical (union SHA256
`e73759ec03f000302cc5cd1f14473db3e6413834caf580754edccf4653fc9a3e`).
Neither edited module is in that closed literal file list. Generated artifact
inputs were not changed or synthesized. The comparison used a fetch tripwire
and zero HTTP; it is not a new source observation, proof reissue or equality
waiver. The result is retained in `nine-state-noninterference.json` beside the
ledger fixture. Bound precision/metro registry, root package, source-proof helper,
source gates and catalog remain byte-identical to main.

Validation: nine new cadence/hold/force/roundtrip tests, seven existing captured
native pickup tests, 50 existing metro/AZ denial and original MS-boundary tests,
plus `verify:ms`. Selector tests prove eligibility at 30 and 60 minutes, waiting
at 29 minutes, unchanged original clocks, longer holds and generic timers.

After guarded release, a genuine accepted source refresh and actual public
customer-path check are still needed. A 30-minute eligibility interval is not a
guarantee that GitHub invokes the fleet or that a retailer remains healthy.
