# Single Release Lane Safety

## Invariant

Bourbon Signal has at most one open pull request in the repository. That pull request must target `main` and is the sole candidate for the next production release. A branch without the active PR/objective relationship is never resumed automatically.

## Starting work

1. Fetch `origin/main` and list every open PR.
2. If no PR exists, create one release branch from current `main`.
3. If one compatible PR exists, continue it only after reconciling its branch with current `main`.
4. If its branch is a clean ancestor of `main`, fast-forward it.
5. If it diverged, carries tracked edits that cannot be reconciled safely, targets another base, or belongs to an incompatible objective, stop for deliberate reconciliation.
6. Two open PRs are a release-policy failure. The `Single release lane` workflow rewrites the Actions-bound required `single-release-lane` check run on every open PR whenever the PR set changes, so both lanes remain unmergeable until they are serialized.

## Unattended automation boundary

The autonomous operator and every applied daytime objective selection/release share the same OS-backed, crash-releasing writer lock. Applied objective mutations must run through `npm run operator:objective -- ...`; direct mutating calls to `scripts/operator-objective.mjs` are rejected. The coding subprocess receives no production/provider secrets, an isolated unauthenticated GitHub/Vercel config, and a disabled Git push URL. The subprocess may:

- continue the locked objective;
- implement, test, review, and commit local changes.

After the subprocess exits, the deterministic wrapper may:

- restore a deleted initial objective lock;
- verify the worktree is clean and current `main` is an ancestor;
- perform one normal fast-forward push;
- create or update the sole draft PR.

It may not:

- force-push;
- create a second PR;
- adopt an unrelated PR;
- mark a PR ready;
- merge;
- deploy;
- publish production data;
- resolve or release the objective lock.

A stale, diverged, dirty, conflicting, non-draft, or concurrently owned lane becomes a blocked handoff rather than an automatic rewrite.

## Daytime release

Before merging:

```bash
gh pr list --state open
HEAD_SHA="$(gh pr view <number> --json headRefOid --jq .headRefOid)"
node scripts/verify-release-lane.mjs --phase=merge --pr=<number> --expected-head="$HEAD_SHA" --apply
```

Branch protection on `main` requires strict current-base checks, applies to administrators, disables force pushes, requires conversation resolution, and has no review bypass allowances. Both `build-and-verify` and `single-release-lane` are bound to the GitHub Actions application rather than accepting spoofable writer-created status contexts.

The guard requires:

- the PR is the only open PR targeting `main`;
- the PR is no longer draft;
- its tested base SHA equals current `main`;
- its head still equals the reviewed SHA;
- GitHub reports it safely mergeable.

Branch protection uses strict required checks, so a changed base requires checks to rerun.

## Publication ordering

Inventory refresh and snapshot-repack workflows share one production concurrency group. Immediately before activation they query current `main` and compare it with `GITHUB_SHA`; immediately after activation they repeat that authority check. A stale workflow exits before publication, or performs an identity-guarded rollback only if its own snapshot is still active. Snapshot pointer activation still uses compare-and-swap, so concurrent pointer changes also fail closed.

This creates two independent protections:

1. **Code provenance:** only current `main` may publish.
2. **Pointer ordering:** only the run holding the expected active-pointer revision may activate.

## Emergency hotfix

A hotfix does not create a parallel lane. Pause or close the current PR, release the lane, merge and verify the hotfix, then reconcile the paused work onto the new `main` before reopening it.
