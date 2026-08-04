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
- Narrow exception: a Kanban coverage task may complete a release end to end only when its task ID plus immutable job key pass the production-backed authority proof and the shared release-lane writer lock remains held from admission through atomic draft-PR creation. Admission must prove the lane is empty, `main` is current, and any objective lock belongs to the same branch. The capability itself remains in the local Hermes authority store and must never appear in task prose, logs, comments, or PR metadata. A mutable `created_by` label is never authority. After successful admission and authority proof, the task may create the sole PR, mark it ready after required review, perform the guarded exact-head squash merge, run the targeted production refresh, verify canonical production, resolve its objective, and release its lock without another approval. This exception never permits force-pushes, bypassed checks, quality-regression overrides, access-control bypasses, unreviewed outbound customer messages, or publication without immutable production proof. The database outbox—not the worker—sends the structured terminal result to Engine Ops. Requester contact remains separate and requires a validated requester-notification-ready result plus owner approval.
- Narrow exception: the dedicated Release Radar publisher may complete a release end to end for at most three coherent records in one PR when every record is revalidated at run time against an accessible official government, control-state, producer, or event-organizer source. Admission must prove the release lane is empty, `origin/main` is current, any objective lock is compatible, the record is not already represented in the public catalog, dates and market scope are explicit or honestly presented as a broad window, and the copy remains announcement-only and non-alertable. Secondary-only reports, retailer inventory claims, inferred allocations or quantities, stale pages, and ambiguous source changes cannot enter this lane. The publisher must work from a clean temporary worktree, write or update focused contract tests, obtain an independent read-only review, wait for all required CI and preview checks, perform the guarded exact-head squash merge, verify the canonical custom domain and calendar output, reconcile the research ledger only after production proof, and remove its branch and worktree. It must stop without publishing if any gate fails; it may never force-push, bypass checks, create availability alerts, change pricing or entitlements, or send customer communications.
- Immediately before a daytime merge, capture the PR head SHA and run `node scripts/verify-release-lane.mjs --phase=merge --pr=<number> --expected-head=<sha> --apply`. The guard performs the squash merge with GitHub's expected-head compare-and-swap.
- Required checks must run against current `main`. If the base or head changes, rerun validation.
- Engine publication workflows must verify their checkout still equals current `main` before snapshot activation. Older work never replaces newer work.
- After merge, delete the release branch and release its objective lock before starting the next PR.

Emergency hotfixes are serialized: pause or close the normal lane, merge and verify the hotfix, then reconcile paused work onto the new `main` before reopening it.
