# Bourbon Signal Operations

This runbook defines the clean operating model for Bourbon Signal engineering, engine refreshes, and production deploys.

## Source of truth

GitHub is the source of truth for Bourbon Signal code and committed website-facing engine exports.

- Repository: `tarsagent22/Bourbon-Signal`
- Production branch: `main`
- Vercel project: `bourbonsignal`
- Live domains: `bourbonsignal.com` and `www.bourbonsignal.com`

Do not treat a Vercel deployment as a replacement for committed code. Production must be reproducible from GitHub plus documented environment variables.

## Branch workflow

1. Start from clean `main`.
2. Create a focused branch:
   - `ops/...` for workflow/deploy/automation changes
   - `fix/...` for bugs
   - `feat/...` for user-facing features
   - `chore/...` for safe naming/maintenance
3. Keep generated engine export changes separate from unrelated UI/code work unless the task explicitly needs both.
4. Run verification locally before push.
5. Open a PR and let CI pass before merge.
6. Merge to `main`; Vercel handles the production build from GitHub.

## Dirty tree rule

Do not deploy from a dirty working tree.

Before any production deploy:

```bash
git status --short
```

Expected output is empty. If it is not empty, either commit the change intentionally or discard it. Dirty local CLI deploys are only acceptable for emergencies and must be reconciled back to GitHub immediately afterward.

## Engine refresh

Current local Windows Task Scheduler task:

- Task: `Bourbon Signal Engine Refresh`
- Cadence: every 5 minutes
- Command: `wscript.exe C:\Users\chand\Projects\Proof\engine\bourbon-signal-engine-refresh-hidden.vbs`
- PowerShell wrapper: `engine/bourbon-signal-engine-refresh.ps1`
- Engine command: `node src/refresh-site.mjs`

The refresh loop may run frequently, but it should not silently deploy production by default. Auto-deploy is explicitly opt-in:

```powershell
$env:BOURBON_SIGNAL_AUTO_DEPLOY = '1'
```

Leave that unset or `0` for normal operation.

## Manual engine verification loop

From the repo root:

```bash
cd engine
npm install
npm run refresh:site
npm run verify:site
npm test
```

Use the full engine verification when the full `engine/out/*` runtime outputs exist locally. Use `npm run verify:site` for lightweight CI checks against the committed `engine/out/site/*` contract exports.

Key gates:

- site contract version is `bourbon-signal-site-v0.1`
- customer-facing states exclude research/weak states such as TX until approved
- inventory-alertable signals remain store-level only
- NC aggregate board/warehouse signals are not treated as inventory-alertable
- state health has no unexpected failed states
- generated public drops preserve honest source caveats

## Production deploy

Production deploy should normally be GitHub-driven through Vercel after merge to `main`.

Before production deploy or merge:

```bash
npm ci
npm run test:ops
npm run build
npm --prefix engine run verify:site
```

For engine-heavy changes, also run from `engine/`:

```bash
npm test
```

Do not deploy if:

- build fails
- ops checks fail
- site contract check fails
- engine source health regresses unexpectedly
- generated export counts collapse without a known source outage
- alerts become eligible without a deliberate alert policy change

## Alerts policy

Alerts are intended to be fully automated for matching user preferences, but only after the alert branch enables the delivery gates safely.

Rules:

- match user territory/preferences
- match watched bottles when user is in specific-bottle mode
- use engine-sourced candidates only
- do not trigger from member sightings for now
- keep live delivery disabled unless `ALERT_DELIVERY_ENABLED=1`
- run `/api/alerts/deliver?dryRun=1` after a refresh before enabling live delivery
- reject email delivery for bootstrap candidates, manual refresh quarantine candidates, stale observations, unknown freshness, or candidates older than `ALERT_EMAIL_MAX_FRESHNESS_HOURS` (default 24)
- set `BOURBON_SIGNAL_MANUAL_REFRESH=1` or `BOURBON_SIGNAL_ALERT_QUARANTINE=1` when intentionally running a manual refresh that should produce review-only candidates
- cap emails globally and per user per run
- dedupe aggressively
- include source/availability caveats
- avoid overpromising language such as “just hit”; use “Fresh signal detected” until the source proves real-time inventory

## Texas policy

TX is not customer-facing until stronger data is available. Keep TX out of `CUSTOMER_ACTIVE_STATE_IDS`, active UI states, site exports, and alert delivery.

Research code/source registry entries may remain for future work as long as they are not customer-facing.

## Stripe pre-launch policy

Checkout remains disabled while founding tester mode is active. Stripe code should be build-safe without local Stripe secrets and should return a controlled disabled/configuration response instead of breaking builds.

When the July 1 launch branch begins, verify:

- price IDs exist for monthly, annual, and founder
- checkout is enabled intentionally
- webhooks are configured
- success/cancel flows work
- refund/cancel copy matches legal posture

## Rollback

Rollback options, in order:

1. Revert the PR/commit in GitHub and let Vercel redeploy `main`.
2. Use Vercel to promote the last known-good deployment.
3. If engine data is bad but code is good, revert only the generated `engine/out/site/*` export commit or regenerate from the last known-good engine snapshot.

After rollback, verify:

```bash
curl -s https://bourbonsignal.com/api/stats
curl -s 'https://bourbonsignal.com/api/drops?limit=3'
```

Confirm the homepage and signed-out drop preview still load.
