# Codex coverage requests

The owner authorizes automatic coverage handling through release, with one combined morning report in the Codex chat. Hermes must not execute, schedule, delegate, release, or report on app coverage requests.

The native Codex heartbeat is `bourbon-signal-coverage-requests`, attached to the existing owner chat and scheduled once daily at **1:00 a.m. America/New_York**. It uses the chat's configured model. Keep the computer awake and the Codex app running. This is a local automation, not an always-on cloud worker. The operating window ends at 7:00 a.m.; do not start new work after that time. Scheduled runs use noninteractive permissions when permitted by the host policy. Routine research and authenticated coverage releases have standing owner authorization; do not ask for approval again. Never weaken the release or source-evidence checks to remove a prompt.

## Overnight controller

Follow `automation/bourbon-signal/nightly-coverage-prompt.md`. Run `node automation/bourbon-signal/codex-coverage.mjs nightly` to snapshot **all** current runnable requests, grouped by state, without claiming them. The private dated ledger survives interruption; rerunning it resumes the same night's snapshot. New requests after the snapshot join the following night's batch. Reconcile existing prepared receipts against actual final messages before preparing any new report.

Research each group's shared first-party sources once. Save timestamped source probes and findings in ignored `.operator/coverage-research/<state>/` files in the controller checkout. Reuse evidence for overlapping targets only when identity, geography, freshness, and runner access remain valid; do not reuse a prior access failure as a current failure without checking it. Capture each target's production baseline before a shared release. Investigate existing coverage first, then access and inventory semantics before writing an integration.

Use `next` to claim the next request in the group through the existing single-writer lease. It reports the budget: **20 minutes discovery**, **45 minutes implementation**, **one retry only after a relevant change**, and **six hours maximum per night**. These limits apply to active implementation; an in-progress external CI/refresh stays pending with its exact run id saved. Do not spend the night polling an unchanged access block. If no source is viable, complete with the actual bounded audit; if research is unfinished, defer without inventing an exhaustive failure.

To move past unfinished research with no open PR, use the shared writer lock:

    C:/Users/chand/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe scripts/run-with-release-lane-lock.py -- node automation/bourbon-signal/codex-coverage.mjs defer <jobKey> research_budget

Other allowed reasons are `source_wait`, `verification_wait`, and `night_window_ended`. Deferral keeps the member request open, preserves job/version/history, and skips it for the rest of that night. An open release PR must retain its active authority and cannot be deferred to claim unrelated work. Save its worktree, PR, head, CI and refresh run in `.operator/coverage-active-attempt.json`; resume it next night. Research other snapshot targets read-only while the release lane is occupied, without claiming or creating a second PR.

Compatible improvements for overlapping requests should share one integration/release. The release remains bound to its authenticated owning job. After verification and completion, claim the related requests sequentially and prove each exact target independently using their pre-release baselines and the same immutable production artifact. Do not manufacture a fresh release for a source already deployed. `complete-existing` still requires the server's target-level approval; county/store expansion still needs exact target evidence.

After each stage, run `checkpoint <jobKey> <ignored-json-file>` with `stage` and optional `workspace`, `branch`, `pullRequest`, `headSha`, `refreshRunId`, and `evidenceFile`. The helper verifies current authority, rejects unknown fields and capability leaks, and saves progress privately for recovery. Keep the controller's active-attempt file synchronized.

### Source-specific publication

Production refreshes keep the single `production-inventory-refresh` concurrency group and use GitHub's bounded queue (`queue: max`, up to 100 waiting runs). A later scheduled refresh no longer replaces the one pending targeted run. A queued checkout that has been superseded by main is rejected before collection; its request stays pending for the controller to resume on current main. The publication-time main and rollback checks remain mandatory. See [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

Production refresh verification authenticates a short-lived, request-bound count probe using the existing engine snapshot key. It checks the same prepared, filtered member feed as `/api/drops`, returning only aggregate counts and snapshot identity. The probe accepts only a state, `limit=1`, and a verification nonce; it cannot return cards, details, history, or other filters. Normal anonymous and Free requests still require paid membership for state filters. Missing worker credentials or invalid proof fails closed. Never log the signing key or signed request header.

South Carolina supports reviewed source cohorts `cityhive`, `da-brown-bag`, `taste-liquors`, `southern-spirits`, `dunes`, `liquor-library`, `discount-liquor-fort-mill`, `all-american`, and `phase1-myrtle`. For an individual integration, dispatch `refresh-feed.yml` with `states=SC` and `sources=<cohort>` or use `scripts/run-production-state-refresh.mjs --state=SC --sources=<cohort> --metadata=<ignored-file>`. Multiple compatible cohorts may be comma-separated. Unsupported states or unknown cohort ids fail before collection.

This refresh collects only selected cohorts and retains other observations as explicitly stale, non-alertable context. It requires a restored last-published site baseline and complete prior state reports. A dedicated verifier requires fresh positive exact-store evidence from the current run **and matching customer-export rows for every selected cohort**. Whole-state breadth verifiers continue for full-state refreshes; coherence, promotion, isolation, current-main, encrypted publication, and live customer verification remain mandatory in both paths. Source-only runs do not automatically repeat a failed collection. Other states retain their existing strict refresh path; do not supply unsupported source scopes.

The old Hermes schedule `0af9a869e52a` is paused. Its running worker was reclaimed and terminated, and its remaining unfinished board tasks were archived or blocked. The three old Python launchers and the legacy Node entry point are disabled. The scheduler export and active automation registry no longer assign coverage to Hermes.

### Massachusetts source preflight

Before a Massachusetts integration, run the manual `ma-source-preflight.yml` workflow on the reviewed deployed main. It makes four fixed, unauthenticated public GETs to Norfolk Wine & Spirits and retains response hashes, HTTP status and selected product flags in an immutable Actions artifact. It sends no orders or customer messages, cannot accept arbitrary URLs, and does not collect or publish app inventory. Verify the artifact run/head and review the first-party contact, pickup policy and product identity separately. A reachable catalog is research evidence; Massachusetts still requires its normal integration, promotion and live customer verification before any request can be completed.

## Queue and authority

Use `node automation/bourbon-signal/codex-coverage.mjs claim` from the real repository. The helper waits when the release lane is occupied. It otherwise acquires the production lease, derives a `cx_` task ID from the current Codex thread, immutable job key, and request version, attaches it, and verifies production-backed authority. A restarted attempt cannot use an older request version's identity. Existing requests, baseline metrics, retries, source evidence, and member privacy must be preserved.

Configuration and capabilities live outside Git in `CODEX_HOME/operations/bourbon-signal`. The private config is bound to the owner chat. Never print credentials or capabilities, copy them into prompts, or put them in Git. The retired Hermes credentials are replaced before the production deployment. New queue bindings accept only Codex task IDs.

The helper outputs safe job metadata. Check current canonical coverage for the exact target. For a fully covered state or city, run `complete-existing <jobKey>`; the server independently verifies current evidence before closing it. An uncertain, partial, stale, directory-only, or shipment-only result cannot close a request. County and store requests require target-level proof of a useful expansion.

For expansion, research a bounded set of lawful sources, reuse valid recent research for overlapping requests, implement and test the fix in an isolated worktree, and complete an independent review. Do not bypass access controls. Apply the overnight budgets above. Waiting for another release remains pending and does not establish a source failure. Preserve a useful local patch while waiting.

## Release

On this Windows host, invoke release wrappers with the bundled Codex Python executable at `C:/Users/chand/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. Do not use a Python executable inside a Hermes installation, even when it appears first on PATH.

The standing authorization applies only to authenticated coverage work. The shared writer lock, current main, sole PR, objective ownership, authority leakage checks, exact reviewed head, required checks, and production verification remain mandatory. No force pushes, quality overrides, unreviewed customer messages, or releases outside coverage.

Before admission, save the reviewed PR body with the exact standalone line `Authority immutable job key: <jobKey>`. Run `verify-authority <jobKey> <taskId>`, then use:

    python scripts/run-with-release-lane-lock.py -- node scripts/verify-release-lane.mjs --phase=admission --create-pr --push-head --expected-main=<sha> --expected-head=<sha> --head=<branch> --title=<title> --body-file=.operator/coverage-pr-body.md --job-key=<jobKey> --task-id=<taskId>

After creation, preserve published history. If main advances, merge current main into the branch and rerun checks and review. Use the same guarded merge with `--phase=merge --pr=<number> --expected-head=<sha> --task-id=<taskId> --apply` under the shared writer lock. A merge is not completion: run the targeted production refresh, hash its immutable artifact, and verify canonical coverage and the customer path for the requested geography.

## Completion and final reports

Write the existing version-two terminal evidence contract to an ignored local JSON file. Run `complete <jobKey> <resultFile>`. A successful result needs verified material coverage and customer-path gains. Engine-only work is not a fulfilled request. A failed attempt needs a plain reason and bounded source-audit evidence; do not fabricate a complete audit or production gain. Member email remains a separate action.

At the end of the night, run `reports` to prepare one combined message containing each Complete or Failed result and the count still pending. Return its text exactly in the final Codex message. No new results means silence, unless an operating blocker needs attention. Preparing text does not prove delivery. On the next scheduled run, use the app's `read_thread` tool to find that actual final message, with its ID, text, thread ID, and completion time. Save that evidence to an ignored JSON file with fields `threadId`, `messageId`, `phase` (`final`), `completedAt`, and `text`. Run `ack-report <receiptKey> <proofFile>` for **each** receipt contained in the combined message. The helper rejects wrong-thread, old, commentary, or unrelated messages. It records the native message ID and replays an acknowledgement safely. The legacy `report` command remains for recovery of older single reports.

Always reconcile a prepared report before claiming another notification. Do not resend when delivery cannot be established. No routine progress reports, customer messages, Telegram delivery, or Hermes notifications. Run quietly when no new final result exists. Keep the heartbeat active for future app requests.

Three earlier requests were closed as already covered: Virginia statewide, Sterling, and Glen Allen. The nine remaining requests cover South Carolina, Indiana, Massachusetts, North Carolina statewide, and Forsyth, Nash, Edgecombe, Jones, and Onslow counties. Their prior attempts remain in history. One earlier South Carolina failure report was sent during the original switch; it is not a result from the new Codex completion run.
