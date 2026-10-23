# Coverage serving and premises baseline repair

Prepared against production/main `a86a0433c7b0b051761fdc5e3625128bbac42281` on October 23, 2026. This is the next narrow reviewable change for [#821](https://github.com/tarsagent22/Bourbon-Signal/issues/821) and the baseline prerequisite for [#820](https://github.com/tarsagent22/Bourbon-Signal/issues/820).

## Result

Customer source-policy reads request one pinned bundle of bottles, state health and alerts. They no longer request broad drop history or construct the collection Bible. Collection retains its original pinned four-export bundle, history, matching and episode semantics. Fresh failure, disable, negative, expiry, classification and final-send checks still apply. No production speed improvement is claimed before deployment and bounded before/after measurement.

The existing authenticated, read-only premises endpoint gains a separate verified-retailer projection. One SQL statement joins both current verification authorities and same-owner stores before exporting only public scalar premises and lifecycle context. It preserves original submitted addresses, expired and sold-out reports, identity conflicts and explicit historical gaps. Meaningful unit/house-number punctuation stays distinct. A conservative street syntax guard sends incomplete or unsupported addresses to explicit gaps rather than inventing physical identifiers or current eligibility; it is not geocoding. Raw account/store/submission IDs, payloads, product data, contacts and reviewer fields are excluded. The manual main-only capture requires and validates this supplement, including closed metadata schemas and recomputed public hashes. Failures cannot produce a successful partial baseline. Row and byte limits bound returned data after retrieval; they do not bound database scan work.

## Evidence and boundaries

The local suites exercise the actual saved scheduler, SQL through PGlite, encrypted snapshot capture and authenticated route. Fixtures cannot prove production data, customer display or new physical connections. The released baseline capture `39899012800` omitted verified-retailer history; only a new capture after release can supply that context. Deleted/revoked/overwritten records and publication history remain explicit gaps even after that repair.

All five proposed CA/NY/TX premises have existing app-directory context. Four have exact physical-address matches; Hot Spot's APT100/Suite100 match remains ambiguous. Directory identity does not establish prior inventory or merchant identity. The original two pilot premises and recoveries do not count toward the five new-connection target. No candidate is activated or counted by this change.

## Delivery and acceptance

Keep this as the sole draft while release is restricted. Before any subsequently authorized release, reconcile current main, exact-head review/checks and the objective through the shared writer-lock workflow. Preserve the original observer start, deadline, reservations, failures and immutable captures. The first-transition rebind helper cannot safely handle mixed historical commits unchanged; a reviewed multi-transition continuity plan is required before rebinding again.

After an authorized release: verify deployed identity and normal Feed/Coverage policy, take a finite serving-cost sample, run the main-only baseline capture once, and reconcile each candidate against its source, directory and verified-retailer context. Then assess the original bounded observation window. Admission additionally needs current fixed product/variant/premise evidence, canonical format and classification, reviewed configuration, repeated genuinely due collections and matching normal customer results. Record actual gains, recoveries, unchanged connector hash, onboarding effort, requests, bytes, failures and remaining gaps. Five stores across three states remain feasibility targets, never evidence substitutes.
