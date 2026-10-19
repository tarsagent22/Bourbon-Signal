# Bourbon Signal Agent Contract

## Release lane safety

Bourbon Signal uses exactly one active production-release pull request at a time.

Before creating a branch or PR:

1. Run `gh pr list --state open` and inspect `.operator/objective-lock.json`.
2. If one compatible PR exists, reconcile its branch with current `origin/main` and continue there.
3. If an incompatible PR exists, stop. Do not create a second PR or mix unrelated work into it.
4. A behind-only clean branch may be fast-forwarded. A diverged or dirty branch requires deliberate reconciliation and must not be overwritten.

Rules:

- Applied objective selection or release must run through `npm run operator:objective -- ...`; the wrapper acquires the same OS writer lock used by unattended automation.
- Never force-push a release branch.
- Automated or cron work may create or update only the sole **draft** PR. It may not mark the PR ready, merge, deploy, activate a production snapshot, resolve the objective, or release its lock.
- Narrow exception: a Codex coverage task may complete a release end to end only when its current Codex thread, request-version-bound task ID, and immutable job key pass the production-backed authority proof and the shared release-lane writer lock remains held from admission through atomic draft-PR creation. Admission must prove the lane is empty, `main` is current, and any objective lock belongs to the same branch. The capability itself remains in the private Codex coverage authority store and must never appear in task prose, logs, comments, or PR metadata. A mutable task label or a supplied thread ID is never authority. The current Codex runtime thread must match the private claim record, and production must verify the exact active task binding. Hermes must never handle coverage requests, release coverage fixes, or send coverage reports. After successful admission and authority proof, the task may create the sole PR, mark it ready after required review, perform the guarded exact-head squash merge, run the targeted production refresh, verify canonical production, resolve its objective, and release its lock without another approval. This exception never permits force-pushes, bypassed checks, quality-regression overrides, access-control bypasses, unreviewed outbound customer messages, or publication without immutable production proof. The durable database outbox supplies one final Complete or Failed report to this Codex chat. A report is acknowledged only with evidence of its actual final Codex message; preparing text is not delivery proof. Requester contact remains separate and requires a validated requester-notification-ready result plus owner approval.
- Immediately before a daytime merge, capture the PR head SHA and run `node scripts/verify-release-lane.mjs --phase=merge --pr=<number> --expected-head=<sha> --apply`. The guard performs the squash merge with GitHub's expected-head compare-and-swap.
- Required checks must run against current `main`. If the base or head changes, rerun validation.
- Engine publication workflows must verify their checkout still equals current `main` before snapshot activation. Older work never replaces newer work.
- After merge, delete the release branch and release its objective lock before starting the next PR.

Coverage preparation does not reserve the release lane. Keep research, implementation, local checks, independent review and source preflights in an isolated branch/worktree. Coverage admission requires an empty objective lane and a fresh readiness file; its binding reserves at most 60 minutes, with no new admission after 6 a.m. Eastern and no merge after 7 a.m. An expired lease cannot be renewed by rerunning admission. Close and preserve unmerged work with the guarded `codex-coverage.mjs park` command before deferring its request. Never park merged work or active publication. The trusted engine watchdog closes only expired, explicitly marked, unmerged coverage PRs and preserves their remote branches; the owning controller then reconciles its private binding and pending request. Resumption requires fresh main, checks, review, source evidence and admission; do not simply reopen the parked PR. Parking is authorized cleanup even outside the implementation window.

Emergency hotfixes are serialized: pause or close the normal lane, merge and verify the hotfix, then reconcile paused work onto the new `main` before reopening it.
