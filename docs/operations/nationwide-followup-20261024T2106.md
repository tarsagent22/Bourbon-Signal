# Nationwide follow-up — October 24, 21:06 UTC

Evidence cutoff **2026-10-24T21:06:47.996Z**. New physical inventory connections **0**, independently confirmed customer restorations **0**, source activations **0**. Five selected premises across CA/FL/NY/TX and Christie's reserve remain preparation, with stale16:55 source preflights. Existing pilot coverage remains two premises/two states/four canonical identities; neither pilot premise counts toward five. Most-later-store production reuse, maintenance cost per admitted store and onboarding minutes remain unproved.

Main is still `a86a0433c7b0b051761fdc5e3625128bbac42281`; sole draft[#824](https://github.com/tarsagent22/Bourbon-Signal/pull/824) remains at `6e5d7a79a2aafbb288f833ab77e84244dd0b771e`. Checked objective locks are absent. This pass changes only the isolated preparation branch and evidence. No second PR, existing-PR update, merge, deployment, source activation, source request, release-lock change, due reset or installed/unrelated monitor change occurred.

## Concrete six-file delivery candidate

The earlier planned-source canonical capture (`@1`) imports the prepared collector, premise helper, matcher and source-policy context. Its closure differs from exact #824, including shared matching behavior. Copying that closure is **not** a read-only delivery change. The new canonical-only `@2` separates the production read from future planned-source assertions.

`minimal-delivery-slice/canonical-context-v2-on-824.patch` is a byte-exact six-file patch against the actual #824 head, SHA **`911992e5c60e17ebf314675a0f3ae4addb567841e5b35c9599115a987c6e63ce`**:

| Path | Change |
| --- | --- |
| `scripts/lib/shopify-canonical-context-capture.mts` | New read-only selected production canonical/state context producer. |
| `scripts/capture-shopify-canonical-context.mts` | New guarded main-only capture command. |
| `scripts/test-shopify-canonical-context-capture.mts` | New56-case encrypted-reader test suite. |
| `.github/workflows/shopify-canonical-context-read.yml` | New manual main-only read workflow; no collection/publication. |
| `package.json` | Exact #824 package plus one standalone test and its engine-chain hook; dependencies/lock unchanged. |
| `automation/bourbon-signal/automation-registry.json` | Exact #824 registry plus only this workflow's script-only sensor entry. |

The isolated Git index changes exactly those six paths; its candidate tree `eb7a0d36bd962af45658784c649aef00e077667b` is **a tree, not a commit or future production identity**. A read-only `git apply --check` passed on the untouched exact #824 worktree. The same four new files, eight unchanged dependencies and exact #824 package/lock were exported to an ignored isolated directory; all56 tests passed there. Independent review reconstructed the exact diff and confirmed unchanged existing registry entries, scripts except the stated hook, dependencies and all runtime source files. Combining the candidate with current #824 would affect18 unique paths relative to main; it does not pull the94-file preparation branch into the lane.

This patch is **a delivery candidate only**. Existing #824 head/index/worktree are unchanged. The release operator must reconcile the lane, obtain fresh exact-head checks and review, and deliver through the established process. No candidate tree/PR head may substitute for the eventual actual production merge/deployment commit. The patch and hashes are preserved outside Git alongside the committed source bytes and an incremental preparation bundle.

## What @2 proves, and what remains separate

`bourbon-signal/selected-canonical-context@2` selects four fixed canonical IDs/names and five state/canonical pairs across CA/FL/NY/TX. It reads actual production bottles, state-health and alerts through the existing verified encrypted snapshot reader: one memoized manifest plus three exports, two pointer reads and two production-release reads. Expected live/producer commit, snapshot and pointer pins must agree before and after. Existing classification data/implementation bytes are checked; selected identities must be unique/correctly named and state classifications eligible. Missing, corrupt, stale, quarantined, mixed-clock, changed-pointer or ineligible context fails closed.

The output has no merchant, source config, store, product, variant, planned fixture catalog or collector authority. It emits no admissions/descriptors, zero accepted stores and activation false. It proves selected canonical/state context only; it does not prove source permission, exact-store inventory, runtime source enablement or customer publication.

Its runtime/test closure uses eight existing files, independently verified byte-identical in #824 and main: remote snapshot reader, classifier, bottle-scarcity helper, identity redirects, classification JSON, Blob storage adapter, and the existing encrypted fixture publisher/contract. No collector, safe matcher, premise helper, source registry, source scheduler or planned-manifest changes enter this delivery slice.

CLI execution requires main GitHub Actions, exact checkout/live commit and the two existing Blob/encryption credentials. It reads only two fixed local classification artifacts and fixed production health. Workflow permissions are `contents:read`; shared baseline concurrency prevents overlapping baseline/context reads. It is manual,8-minute bounded, has no source scheduler/SQL secret, and writes a create-only64KiB artifact. Logical limits are4 immutable reads,2 pointer reads,2 release reads,100,000 bottle rows,15-second read races and60 seconds total. Policy snapshot context is capped at seven days, not an inventory freshness promise. Byte/decompression/SDK buffering/retry/cancellation limitations remain explicit; registry16 HTTP calls is a nominal estimate, not a guaranteed provider cap.

Historical `@1` producer/consumer/tests stay unchanged in preparation and are **absent from the six-file patch**. The `@1` consumer cannot ingest/relabel `@2`. A separate reviewed offline adaptation must bind actual authenticated `@2` rows to planned tuples; baseline/newness, fresh pickup evidence, actual source admission and repeated customer acceptance remain independent. The new workflow has not been released, dispatched or credentialed-run.

## Observation approaching its original bound

One bounded workflow census imported37 new captures, s217–253. All **239 actual artifacts** (s0–130 and s146–253) pass ZIP/member/index/GitHub checks,1195 payload hashes and956 Feed/Coverage receipt checks. There are no new selected-source failures in s217–253. The historical s214 Mission Trails HTTP5xx remains the only selected-pilot issue; matching retained generation627 rows were not evidence of current source acceptance. Later generation629 recovery and the explained627→629 accepted-generation gap remain visible.

Latest complete response is **21:03:36.577Z**. Mission Trails is generation640, Jensen78, with three/one matching current customer identities at their capture clocks. The108 post-recovery captures span17.8337614hours with no new sampler failure or interval above15minutes. Total first-to-last complete-response span42.1863575hours is not continuous-day acceptance: missing131–145 and the160.08027-minute response gap remain. Source failure, sampler gap and limited receipt fields remain separate; no new full-card, `canAlertAsInventory`, queue or provider-delivery proof is claimed.

Original start `2026-10-23T02:51:11.6844346+00:00`, deadline **2026-10-25T02:51:11.6844346+00:00**, maximum288 reservations, reviewed release transition, task/runner/wrapper and prior failures are unchanged. Only about5h44m remain at cutoff. Finish assessment at that original bound; do not extend/reset it or treat broad monitoring as this source soak. Any later observation window remains a separate decision. Continuous24-hour acceptance remains false.

| Existing source | Visible accepted scheduled collections | Accepted accounting |
| --- | --- | --- |
| Mission Trails CA |72; generations568–640 excluding failed628 |288GET /285,947,285bytes |
| Jensen FL |73; generations6–78 |146GET /811,176bytes |

These totals exclude unknown failed-request costs and do not prove every unseen run absent. Since the prior cutoff,11 accepted runs per selected source add66GET /43,820,521bytes. CA remains general retailer pickup policy plus online orderability; Jensen exact-variant pickup orderability. Physical on-hand quantities are unknown. No new source-recovery event is counted this pass; prior three natural recovery events over two existing premises remain source-level evidence, not new stores/confirmed Del Mesa customer restoration. Del Mesa595–605 all accepted from15:10 through21:00:24.660; earlier schema/HTTP incidents and Ohio dependency status remain preserved.

## Current premise reconciliation

One latest completed successful normal main/a86 refresh, run **40130082884**, artifact **12574378253**, was downloaded:16,024,950bytes, ZIP SHA `423556cf612165faaf8a438a0b357c765f6ae3ac459ed7d6c6e7de6952f23a17`. Six bounded members totaling19,060,117 uncompressed bytes were inspected in memory and public scalar projections preserved. No raw product payload extraction, merchant stock request or cache-body download was made.

The selected five **and reserve** have zero exact/ambiguous matches in those CA/FL/NY/TX state outputs, and no current/stale/retained inventory overlaps rederived from either immutable October23 baseline in their recorded scope. This supports continuing their review; it does **not** establish absence from omitted verified-retailer or pruned/history lanes, nor current pickup stock or newness certification. Directory aliases remain independently reviewed context, not inventory.

Grapes & Grains GA still has one locator row per two fixed merchant premises and no inventory rows; the saved `reachable_no_safe_inventory_rows` roadblock is preserved. Corkdorks TN has13/9 inventory-typed rows with newer **19:30:00.776Z** observations; zero rows carry `cacheFallback:true` in this artifact, but flag absence is not live-HTTP proof. Exact per-source attempt/refresh clocks and current customer results remain unknown. Do not rank the old zero-current baseline as a present outage or either TN branch as new. Kentucky unit/ZIP conflicts remain unresolved. Ohio/POS stay deferred; denied cooldowns, unrelated work, no-contact/no-purchase limits remain intact.

## Validation and next decisions

Integrated engine validation: **933 passed, two skipped, zero failed** (935 total). The new56-test suite passed both in preparation and the isolated exact-#824 closure. TypeScript, automation registry, agent-cost/source-scout contracts and four independent CLI fences pass. Existing app build was not repeated because no application/runtime source changed. These are local delivery checks, not CI on an updated PR, release proof or coverage growth.

Next: (1) finish the original bounded observation assessment without hiding failures; (2) route current #824's serving/verified-retailer baseline repair through its authorized operator; (3) use this six-file canonical-only candidate with fresh main/exact-head review/CI rather than copying the broad preparation branch; (4) capture mutually pinned authenticated retailer/canonical context after authorized delivery, explicitly adapt the offline `@2` join, reconcile novelty, then refresh allowed source pairs at actual admission; (5) centrally admit qualified stores and prove repeated due collection/current normal customer results and connector reuse before counting five across three states.

Evidence: `C:/Users/chand/Documents/Bourbon Signal/nationwide-followup-20261024T2106-evidence`. Slice manifest/patch and independent reviews are under `minimal-delivery-slice`; frozen observation analysis remains `feed-source-freshness-818-evidence/analysis/20261024T2106Z/observation-analysis.json`. The follow-up stays active because the five-store milestone and positive observation acceptance are unmet.
