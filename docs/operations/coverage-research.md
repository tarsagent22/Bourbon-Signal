# Codex coverage requests

The owner authorizes automatic coverage handling through release, with one final Complete or Failed report in the Codex chat. Hermes must not execute, schedule, delegate, release, or report on app coverage requests.

The native Codex heartbeat is `bourbon-signal-coverage-requests`, attached to the existing owner chat and scheduled every 30 minutes. It uses the chat's configured model. Keep the computer on and the Codex app running. This is a local automation, not an always-on cloud worker.

The old Hermes schedule `0af9a869e52a` is paused. Its running worker was reclaimed and terminated, and its remaining unfinished board tasks were archived or blocked. The three old Python launchers and the legacy Node entry point are disabled. The scheduler export and active automation registry no longer assign coverage to Hermes.

## Queue and authority

Use `node automation/bourbon-signal/codex-coverage.mjs claim` from the real repository. The helper waits when the release lane is occupied. It otherwise acquires the production lease, derives a `cx_` task ID from the current Codex thread, immutable job key, and request version, attaches it, and verifies production-backed authority. A restarted attempt cannot use an older request version's identity. Existing requests, baseline metrics, retries, source evidence, and member privacy must be preserved.

Configuration and capabilities live outside Git in `CODEX_HOME/operations/bourbon-signal`. The private config is bound to the owner chat. Never print credentials or capabilities, copy them into prompts, or put them in Git. The retired Hermes credentials are replaced before the production deployment. New queue bindings accept only Codex task IDs.

The helper outputs safe job metadata. Check current canonical coverage for the exact target. For a fully covered state or city, run `complete-existing <jobKey>`; the server independently verifies current evidence before closing it. An uncertain, partial, stale, directory-only, or shipment-only result cannot close a request. County and store requests require target-level proof of a useful expansion.

For expansion, research a bounded set of lawful sources, reuse valid recent research for overlapping requests, implement and test the fix in an isolated worktree, and complete an independent review. Do not bypass access controls. Bound an attempt to two hours of active work and one retry. Waiting for another release remains pending and does not establish a source failure. Preserve a useful local patch while waiting.

## Release

On this Windows host, invoke release wrappers with the bundled Codex Python executable at `C:/Users/chand/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. Do not use a Python executable inside a Hermes installation, even when it appears first on PATH.

The standing authorization applies only to authenticated coverage work. The shared writer lock, current main, sole PR, objective ownership, authority leakage checks, exact reviewed head, required checks, and production verification remain mandatory. No force pushes, quality overrides, unreviewed customer messages, or releases outside coverage.

Before admission, save the reviewed PR body with the exact standalone line `Authority immutable job key: <jobKey>`. Run `verify-authority <jobKey> <taskId>`, then use:

    python scripts/run-with-release-lane-lock.py -- node scripts/verify-release-lane.mjs --phase=admission --create-pr --push-head --expected-main=<sha> --expected-head=<sha> --head=<branch> --title=<title> --body-file=.operator/coverage-pr-body.md --job-key=<jobKey> --task-id=<taskId>

After creation, preserve published history. If main advances, merge current main into the branch and rerun checks and review. Use the same guarded merge with `--phase=merge --pr=<number> --expected-head=<sha> --task-id=<taskId> --apply` under the shared writer lock. A merge is not completion: run the targeted production refresh, hash its immutable artifact, and verify canonical coverage and the customer path for the requested geography.

## Completion and final reports

Write the existing version-two terminal evidence contract to an ignored local JSON file. Run `complete <jobKey> <resultFile>`. A successful result needs verified material coverage and customer-path gains. Engine-only work is not a fulfilled request. A failed attempt needs a plain reason and bounded source-audit evidence; do not fabricate a complete audit or production gain. Member email remains a separate action.

Run `report` to prepare the next final report. Return its text exactly in the final Codex message. Preparing text does not prove delivery. On the next scheduled run, use the app's `read_thread` tool to find that actual final message, with its ID, text, thread ID, and completion time. Save that evidence to an ignored JSON file with fields `threadId`, `messageId`, `phase`, `completedAt`, and `text`. Run `ack-report <receiptKey> <proofFile>`. The helper rejects wrong-thread, old, commentary, or unrelated messages. It records the native message ID and replays an acknowledgement safely.

Always reconcile a prepared report before claiming another notification. Do not resend when delivery cannot be established. No routine progress reports, customer messages, Telegram delivery, or Hermes notifications. Run quietly when no new final result exists. Keep the heartbeat active for future app requests.

Three earlier requests were closed as already covered: Virginia statewide, Sterling, and Glen Allen. The nine remaining requests cover South Carolina, Indiana, Massachusetts, North Carolina statewide, and Forsyth, Nash, Edgecombe, Jones, and Onslow counties. Their prior attempts remain in history. One earlier South Carolina failure report was sent during the original switch; it is not a result from the new Codex completion run.
