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
- Narrow exception: a Kanban coverage task may complete a release end to end only when its task ID and immutable job key pass the production-backed authority proof documented in its task body immediately before release. A mutable `created_by` label is never authority. After a successful proof, the task may mark its sole PR ready, perform the guarded exact-head squash merge, run the targeted production refresh, verify canonical production, resolve its objective, and release its lock without another approval. This exception never permits force-pushes, bypassed checks, quality-regression overrides, access-control bypasses, unreviewed outbound customer messages, or publication without immutable production proof. The database outbox—not the worker—sends the structured terminal result to Engine Ops.
- Immediately before a daytime merge, capture the PR head SHA and run `node scripts/verify-release-lane.mjs --phase=merge --pr=<number> --expected-head=<sha> --apply`. The guard performs the squash merge with GitHub's expected-head compare-and-swap.
- Required checks must run against current `main`. If the base or head changes, rerun validation.
- Engine publication workflows must verify their checkout still equals current `main` before snapshot activation. Older work never replaces newer work.
- After merge, delete the release branch and release its objective lock before starting the next PR.

Emergency hotfixes are serialized: pause or close the normal lane, merge and verify the hotfix, then reconcile paused work onto the new `main` before reopening it.
