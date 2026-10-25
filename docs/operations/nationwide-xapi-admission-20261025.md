# Nationwide XAPI admission and usefulness review — October 25, 2026

Checkpoint: 15:10 UTC heartbeat, reviewed against main `7731ccb592cc3b70d681ba356ebd4b7bbbcd92ad`. **Zero genuinely new customer-connected stores, zero restored stores, zero admissions and zero activations this pass.** The released CA/FL pilot remains in place. This is reviewed implementation preparation; production was not changed.

## What changed the coverage decision

The previous five-prospect cohort has thirteen captured stock-positive bottle/store observations across AZ, CA and NV. Running those identities through the actual generated classifier and normal Feed/Coverage path exposed a material usefulness gap:

| Premise | Captured positive bindings | Default Feed eligible bindings | Prepared normal Coverage result |
| --- | ---: | ---: | ---: |
| NV Albertsons 4024 | 2 | 0 | 0 |
| NV Albertsons 1059 | 2 | 0 | 0 |
| CA Albertsons 745 | 2 | 0 | 0 |
| CA Albertsons 707 | 2 | 0 | 0 |
| AZ Safeway 1749 | 5 | 3 | 1 potential premise in offline simulation |

Buffalo Trace and Bulleit classify as regular in this baseline. The four CA/NV premises remain raw source feasibility reserves, not a useful five-store cohort. At AZ1749, Wild Turkey Rare Breed, Blade and Bow and Penelope Four Grain classify as limited. The classifier was not changed. The AZ replay uses synthetic admission and fresh runtime clocks while retaining original capture timestamps; it proves local compatibility, not current stock, production admission, novelty or delivery. The thirteen original observations were captured around 03:13/03:16 UTC and 09:16 UTC; they cannot authorize a later source by relabeling their clocks.

The initial `usefulness-audit.json` correctly recorded zero eligible Coverage results before an AZ identity compatibility defect was fixed. `postcompat-usefulness.json` records the later one-premise simulation without rewriting that earlier result. AZ1207 and AZ2799 remain existing controls; #829 gains are not attributed to this pass. Current, historical and directory reconciliation must be refreshed before any store is counted new.

## Concrete prepared changes

The shared grocery connector now has reviewed admission policy, bounded poll collection, existing SQL scheduler projection and normal cached customer-consumption integration. The production registry is empty. Configured identities bind exact premise, merchant, product/variant, canonical bottle, 750 ml single-bottle format, collector/runtime hashes and an admission expiring within one hour. Current global identity and state eligibility are rechecked at consumption. Missing, disabled, expired, withdrawn or unregistered authority fails closed, including cached base rows.

The runtime reuses the existing bounded parser/matcher/serializer: one request, 12-second deadline, 2 MiB decoded-body limit, no redirects or retries. Source-owned paired product/variant identities prevent cross-store replacement. Existing fenced `source_poll_jobs` lease/finish storage supplies due scheduling, cooldown and late-writer protection. First bootstrap is silent; unchanged stock and quantity changes retain their episode. Unknown and omitted first-page products do not become invented out-of-stock observations. Request/byte accounting survives failures after collection and projection.

AZ uses its existing banner identity and source label while retaining a distinct managed runtime ID and hash-bound proof. Managed quantity/inventory semantics now survive the AZ legacy serializer. The existing Arizona public identity guard is unchanged. These are compatibility exceptions to record when measuring reuse, not proof of unchanged production reuse across later stores.

**Negative handling remains a gate:** an offline scan of 497 retained documents found no accepted explicit zero for these thirteen bindings. The current runtime conservatively emits unknown rather than claiming an implemented provider-negative extractor. Projection tests exercise a hand-built bound negative/restock transition; they do not prove provider-negative acquisition. Full connector reuse and maintenance cost per delivered store remain unproven.

## High-value repair prepared alongside expansion

California verification compared fresh alert count to raw inventory count. The captured raw state has twelve inventory rows at two existing premises, while normal classification/export yields ten eligible current alert identities. Hard Truth Sweet Mash and Pursuit United Double Oaked are standard and correctly excluded. The old twelve-alert floor therefore rejects valid classified output.

The prepared verifier derives the expected identities through the normal exporter and requires the deterministic floor of up to twelve eligible identities. It rejects invented identities and duplicate-only substitutes. Existing source, quantity, freshness, quality, strict inventory/drop floors and physical-store/location checks remain. The retained-not-due exception allows missing expected cards only where already permitted, while still rejecting invented inventory. Replaying at the captured failure clock reproduces twelve raw to ten eligible identities. The pre-fallback live alert body was not archived, so this is a deterministic diagnosis and local repair, not a published two-store recovery.

A finite read of the latest eight refresh metadata records and one immutable diagnostic artifact from run `40201770273` showed CA overdue with ten retained rows and NV overdue with eleven. AZ had 305 fresh diagnostic inventory rows. A successful diagnostic workflow is not a receipt for an activated customer snapshot. NV's 27-to-6 failure is consistent with 21 LiquorBox rows disappearing, but the failed candidate body is absent; no cause or recovery is asserted. LiquorWorld's retained 429 remains held. No unrelated collector, monitor or fallback guard was changed.

## Validation and measured effort

Independent GPT-6.1 Sol review passed 150 local tests: 26 new policy/runtime/projection/CA tests, 120 existing regional/pilot regressions, two actual in-memory SQL scheduler tests and two normal Coverage tests. Full TypeScript no-emit passed. The scheduler analyst separately confirmed independent CA helper review with no blockers in `ca-independent-review-confirmation.json`. Final staging exposed mixed line endings and blank EOFs in nine new helper/test files that the unstaged tracked-file whitespace check had missed. Those files were normalized to LF with one final newline, and the CA test passed again. Final staged whitespace and formatting review supersede the earlier check. These checks use explicitly simulated clocks/admissions where required; there was no production CI, source activation or unattended collection acceptance this pass.

No merchant inventory endpoint request was made this pass. Research used three web searches and official discovery page reads; decoded bytes and elapsed page-fetch cost were not measured. Offline fixture tests and downloaded GHA diagnostics are separate costs. The connector request caps are limits, not measured per-store operational costs. Since no customer store was delivered, effort per delivered store cannot be reported as a finite success metric.

Evidence packet: `C:/Users/chand/Documents/Bourbon Signal/nationwide-xapi-admission-20261025T1510-evidence`. `final-green-review.json` pins seventeen reviewed implementation file hashes and validation logs (SHA256 `6ec434511996b8e93e8862e8ea5e4b880dde7a9e9cf9fdd5093b6222a07491ea`); the separate formatting reviews record all nine final normalized hashes. Earlier failing tests/reviews remain. California-only commit `90d361a9` can be reviewed independently of the shared scheduling preparation; this does not authorize merging the broader branch.

## Ranked next work and explicit gates

1. Submit the California verifier repair through the sole authorized release process, then establish actual accepted generation and customer freshness before claiming any restored premises. Keep NV incident diagnosis separate until its failed candidate is available.
2. Replace the four regular-only cohort reserves with premises that have current useful bottle evidence. AZ1749 is one promising local result, not a substitute for five useful new stores across three states. Obtain fresh bounded allowed evidence, current source/canonical authority and full current/historical/alias reconciliation before admission.
3. Official discovery identified Safeway at 14020 E Sprague Ave, Spokane WA; Albertsons at 4909 E Main St, Farmington NM; and Safeway at 2685 Mill Bay Rd, Kodiak AK. These are physical liquor-department discovery candidates only. WA is currently research-only and NM/AK have no lifecycle entry; the shared admission scope is AZ/CA/NV. No source, lifecycle or inventory authority was enabled. Farmington's linked category route returned “Pardon Our Interruption” once and is held without retry, bypass or alternate route. Its loc=824 hint is not a verified merchant binding.
4. Before activation, complete current production-bound admissions/policy, useful cohort reconciliation, reviewed actual-negative handling, normal Feed/Coverage evidence and independent final review against fresh main. Then use the sole authorized release lane and genuinely due repeated unattended source/customer captures. Do not change classifications or fabricate negative proof to meet the target.

The broad preparation branch must not be merged wholesale. Preserve unrelated main work, released pilot, denied-source cooldowns, release locks and monitors. Ohio/POS, business outreach, purchased access and agreements remain out of scope.

## Original observation assessment preserved

The original bounded window ended at `2026-10-25T02:51:11.684Z` without continuous acceptance: 258 reservations, 250 body captures, eight metadata-only workflow outcomes and thirty unreserved slots. The 160-minute gap, CA generation 628 HTTP5xx and 177.64-minute tail remain recorded. Dispatch or workflow completion is not an accepted observation. No ledger, due time, original deadline or monitor was reset or extended.

Final original assessment SHA256 remains `20eb61c4fc7140b1c096c428f35ccb9f91cdb5f7b5c7bb5453179fb1e524f614`. Assessment is complete; continuous observation acceptance is false. The five-store milestone is false. The follow-up therefore remains active, with no AI polling loop and no new sampler installed.
