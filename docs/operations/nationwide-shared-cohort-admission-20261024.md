# Shared Shopify cohort admission — October 24

This pass follows the direct instruction to release the existing work and qualify the next five premises. It preserves the CA/FL pilot and the #818 fix. The target remains five new inventory connections across at least three states. As of the prerelease review, **zero new premises are accepted**. No merchant has been contacted or charged.

## Released prerequisite and measured evidence

[PR #824](https://github.com/tarsagent22/Bourbon-Signal/pull/824) merged through the exact-head guard as `ff7b9a95f0d2f02ae6e9d5ac366d18b29da586e0`. Production deployment `dpl_2rrKjQXjiiDPcyD6PVjyw55xDGT3` and its natural 23:00 cron heartbeat identify that commit. Ordinary Feed/Coverage reads returned HTTP 200. The unused drops export is removed from serving preparation; collection retains it.

Before release, two warm Feed requests measured 3,756/4,047 ms total and the initial request took 9,189 ms. After release, two warm totals were 3,004/3,208 ms and the initial total was 8,700 ms. Initial preparation itself increased from 4,870 to 7,992 ms. These small samples use different snapshots and establish neither p95 nor a causal performance claim. #821 stays open.

The original bounded #818 observer was rebound to the new commit using reviewed immutable GitHub metadata and an OS-locked persistence procedure. Its start, deadline, reservations, missing slots and failure history remain intact. A finite pre-release audit added ten verified captures (s254–s263), with matching normal receipts and no new selected-source issues. The previous 160-minute response gap and CA HTTP 5xx remain; continuous 24-hour acceptance is false. Dispatch/completed workflow metadata never counts as accepted source evidence.

## Qualification and blockers

The selected premises are Remedy Glendale and Main Street El Cajon (CA), Spirits4Less Miami (FL), Vino Lexington (NY), and Hot Spot Austin (TX). Each proposes one variant at one exact physical address. Together they cover four bottle families, with binary pickup orderability and unknown exact quantity. Christie’s La Crescenta is a reserve. Existing directory identities are reused; no new-address discovery claim is made.

Authenticated baseline run [40141014281](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40141014281) captured current/stale/retained inventory, independent sources and the verified-retailer projection at 23:02 UTC. Member SHA-256 is `6838000d6af8789a6027d263ddb6f2e99e684a2176695f4a20d66c37b3f25393`. None of the six selected/reserve premises matched inventory in the checked layers. The bounded history has one missing snapshot and cannot prove all-time absence.

The retailer projection retains one incomplete identity gap. A separate authenticated fixed public-only SQL read, in a read-only Repeatable Read transaction, found one directory-only row and zero reviewed submissions. That diagnostic is additional point-in-time evidence, not replacement of the original incomplete baseline. Its SHA is `aad887585f65ca1d02b446587c5e26719daa4fb4467031e8e8d2fc9468fa43b7`. All deleted/revoked/unsupported/overwritten/publication-history gaps remain. The automated admission packet stays blocked; any central classification must explicitly review this separate scoped evidence.

Canonical capture [40141150087](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/40141150087) failed closed. The authenticated refresh artifact's `state-health.json` exactly matches the pinned descriptor (`7eafeec5364056df19ef8304fcf2080440cf0c38e06ed0652a4c989dc94c9bb0`): NY is `stale_useful`, which the canonical-only producer incorrectly rejected. The narrow repair permits that recognized nonblocked status for canonical classification, retains the stale caveat, and still rejects blocked/unknown/missing/duplicate states. It grants no source inventory freshness or admission. Safe typed rejection codes make future failures diagnosable without raw private errors.

## This release and next acceptance

The shared runtime adds strict premise identity, exact tuple ownership, a conservative plural-year product grammar repair, v2 provenance preservation, and generic receipt capture. All five later configurations use the same collector; no merchant-specific code branch is added. Historical fixtures and their old capture clocks remain historical. A separate manual main-only sensor reads normal customer receipts and selected scheduler scalars; it never collects or activates sources.

The production admission registry remains empty in this prerequisite release. Before enabling it, the lead must acquire a successful authenticated canonical capture, run a bounded fresh ten-request merchant preflight, replay the actual unchanged connector, reconcile all premise aliases/history, and seal the actual approval/configuration bytes. An independent review and the single guarded release lane are required. Local fixtures and passing tests earn zero stores.

After actual admission, require silent bootstrap, multiple genuinely due scheduled generations, matching normal Feed/Coverage identities and clocks, and separate queue/bootstrap proof. Record requests, bytes, elapsed time, failures, fresh bottle families, unique premises and configuration effort. The new two-hour sampler is reviewed preparation only until installed with the actual release SHA. The original #818 observer is separate and cannot be reset or repurposed.

Evidence packet: `C:/Users/chand/Documents/Bourbon Signal/nationwide-release-admission-20261024T2221-evidence`. Raw failed captures, initial test failures and original reservation ledgers are retained. Ohio and POS work remain deferred; unrelated monitors and denied-source cooldowns are untouched.
