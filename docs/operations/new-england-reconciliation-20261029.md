# New England reconciliation handoff, October29

Based on frozen `3f975f89`. Source and inactive production commits `5e4750b0` and `18e0c34b` are reconciled equivalents of e87/1f. No frozen/current release files were edited. This branch does not activate MA, CT or RI, issue production HTTP, or assert customer coverage.

The new research wrapper `engine/src/new-england-research-runtime.mjs` exports `newEnglandResearchSourceForState`, `newEnglandResearchLifecycleEntries` and `collectNewEnglandResearchReport`. Its cohort is exactly MA2/CT3/RI2. It writes `out/new-england-research/STATE/report.json` and portable `source-captures/` next to that family report, returning the report to the rotating runner. Only explicit isolated mode and the exact registered configuration may collect. Successful captures retain original clocks, SHA-256 and length; all ten alert/onSite/dropFeed/watch/delivery/email/SMS flags remain false. Native denied headers update the shared incident-only journal before cancellation/body handling; failed denial writes leave the durable unresolved latch. Existing denial entries remain review holds even after cooldown. The same per-state journals as production and the earlier hosted preflight are used: `engine/out/source-incidents/new-england-cityhive/{MA,CT,RI}.json`. Restore/save prefix remains `new-england-source-incidents-` and save must run always.

The downloader is `scripts/download-new-england-shadow.mjs`, with `--state=MA|CT|RI --run=<ID> --out-dir=<new folder>`. It requires a completed successful exact-current-head GitHub `state-expansion-shadow.yml` run and immutable `new-england-research-<runID>` ZIP digest. Upload this family directory together with `engine/out/bourbon-bible.json` and `engine/out/library-catalog.json`, so ZIP paths retain `new-england-research/STATE/` under their shared `engine/out` ancestor.

`engine/src/prepare-new-england-canary.mjs` takes the same fixed CLI paths as existing source families: `--state`, `--artifact-dir=<downloader folder>/extracted`, `--provenance=<downloader folder>/provenance.json`, `--out=data/canary-inputs/STATE.json`, `--config-out=out/canary-preparation/STATE/lifecycle-research.json` (run from engine). It reparses every exact premise's hashed body through the strict current library, requires complete current positive premises, then runs actual canonicalization/export into isolated canary rows. Preview markers are preserved explicitly; no production marker or notification eligibility is fabricated.

For issuance, one latest source run is insufficient. `scripts/build-new-england-source-proof.mjs --state=MA --input-dirs=<three distinct downloader directories, comma-separated> --out=engine/out/new-england-source-proof/MA.json` (run from repository root) requires three distinct verified exact-current-head artifacts and reparses all three complete cohorts. It emits the existing runtime's `immutableEvidence.sourceProof` protocol `bourbon-signal/new-england-first-party-cohort@1`, literal cohort hash, complete store-ID list and source run IDs/heads/artifact hashes. The shared issuer must download all three, execute this helper, hash its output, and copy exactly that output into immutable evidence. Do not infer this proof from counters. Two actual canaries and workflow-issued provenance remain required by the existing runtime; all authoritative lifecycle/source flags remain inactive.

Required future source/provenance files in addition to existing shared bindings:

- `engine/data/new-england-research-sources.json`
- `engine/src/collectors/new-england-premises.mjs`
- `engine/src/collectors/new-england-research.mjs`
- `engine/src/new-england-research-runtime.mjs`
- `engine/src/new-england-policy.mjs`
- `engine/src/new-england-production-config.mjs`
- `engine/src/collectors/new-england-production-inventory.mjs`
- `engine/src/collectors/new-england-production.mjs`
- `engine/src/prepare-new-england-canary.mjs`
- `scripts/download-new-england-shadow.mjs`
- `scripts/build-new-england-source-proof.mjs`
- `scripts/test-new-england-production-path.mts`
- `scripts/test-new-england-member-path.mts`
- `engine/out/new-england-source-proof/STATE.json`
- All three downloaded source provenance JSONs and the latest candidate/public-projection JSON.

West owns shared five-state registry/readiness/workflow/issuer composition. MA's former Julio-only research registration must be replaced only by this exact NE registered source, without activating authoritative lifecycle. The NE strict research predicate is `isNewEnglandResearchInventory` from the pure policy module. New England's on-site predicate also participates in the existing current-key inventory freshness gate, preventing historical-only positives from being revived after complete current absence.

Checks: source/runtime/preparer tests reparse all seven frozen first-party bodies (13 rows), mutate body hashes, reject two-source closure, and validate three distinct same-head synthetic schema inputs. These run IDs are explicitly fabricated test schemas, never qualifying metadata. The shared production suite still proves authoritative inactive/forced zero HTTP. Preferences GET/POST and the actual Dashboard SSR component are exercised in `test-new-england-member-path.mts` with offline provider boundaries; signed-out401/free-tier403 remain intact. This is executable fixture evidence, not an authenticated browser/device session. New state manifests now state that precise evidence boundary. Unit tests have an explicit ten-record captured identity/competitor fixture, avoiding a live library network dependency; promotion/source workflows must still sync and reparse against the full current library.

Still not done: shared five-state routing/issuer composition, actual root four-state admission-SHA reconciliation, one complete five-state calibration followed by changed-metadata-head freeze, then three NEW qualifying source observations, two actual canaries per state, owned preview/provenance, and eventual guarded admission. The prior real hosted preflight inspected six healthy independent hosts only; Danbury remains uninspected on the hosted runner. No new HTTP was made during this reconciliation. Haxtons and previously excluded/ambiguous sources remain outside the cohort. No old preflight or unit run counts toward promotion.
