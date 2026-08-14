# Bourbon Signal accelerated automation cadence

All Hermes schedules use `America/New_York`. GitHub Actions cron expressions are UTC and run evenly around the clock; they are not used for owner-facing clock-time delivery.

## Live cadence

| Layer | Schedule | Execution | Delivery |
|---|---|---|---|
| Scheduler reconciliation | 00:05 Eastern daily | Script-only | Ops chat on drift/error |
| Broad discovery + direct probe + ROI scoring | Every 3 hours at :15 | Script-only | Silent success; ops error; 60-probe global cap |
| Known-source direct probe | Hourly at :40 | Script-only | Official `.gov` evidence only; silent success; ops error; 40-request global cap |
| Shadow evidence | 01:15, 05:15, 09:15, 13:15, 17:15, 21:15 UTC | GitHub script-only | GitHub artifacts/errors |
| Browser probe | 05:50 and 17:50 UTC | GitHub script-only | GitHub artifacts/errors |
| Semantic demand and source review | 02:15 Eastern | Agent, read-only | Ops chat only for new actionable source-expansion priorities; Release Radar excluded |
| Autonomous implementation operator | 02:45 and 14:45 Eastern | GPT-5.6 Sol/low in isolated `bourbonbot` profile | Ops chat for completed work, continuation, or material blockers |
| Weekly strategy review | Friday 03:30 Eastern | Luna/xhigh | Main chat |
| Morning scorecard aggregation | 05:00 Eastern | Script-only | Silent success; ops chat error |
| Company briefing | 05:30 Eastern | Luna/xhigh | Main chat |

The 05:15 Eastern briefing cutoff includes all completed morning artifacts. Continuous lightweight sensors continue after the briefing.

## Safety and cost controls

- Brave is discovery-only and cached for 24 hours per normalized query.
- Each expansion run is bounded to five states, and adjacent windows advance by a full cohort.
- Known-source probes never invoke Brave or a browser, accept only official `.gov` evidence, and count redirects against the global budget.
- Browser probing is restricted to the existing HTTPS registry allowlist and six pages per run.
- Discovery, probes, shadow, and browser jobs cannot publish, promote states, or deliver inventory alerts.
- Only the isolated operator worktree may implement one selected objective per run.
- All Hermes jobs use the dedicated `C:\\c\\Users\\chand\\projects\\Bourbon-Signal-autonomous` clone; interactive branches cannot block or be overwritten by scheduled work.
- The coding shift is a profile-wrapped no-agent cron job: the `bourbonbot` profile pins GPT-5.6 Sol with `agent.reasoning_effort: low`, while non-coding semantic and briefing jobs retain their own model policy.
- An existing objective lock is resumed before any new selection. Temporary blockers preserve the branch, worktree, lock, and continuation state.
- An unattended coding shift ends at one CI-verified draft PR and a preserved objective lock. Safe merge, deployment, custom-domain verification, and objective release are serialized daytime actions after current-main reconciliation.
- Every coding shift must validate and aggregate `operator-run-latest.json`; `operator-outcomes-latest.json` tracks qualified findings, starts, completions, merged PRs, production releases, engine expansions, coverage delta, blocked/continued/failed runs, and discovery-to-completion time.
- Existing lifecycle, fixture, shadow, canary, provenance, public-eligibility, and alert-eligibility gates remain mandatory.
- Routine deterministic success is silent. The autonomous coding operator emits only a short owner-facing completion/continuation/error summary; raw agent transcripts, diffs, ANSI color codes, and internal objective JSON are never delivered to chat. The ops chat receives material changes, failures, and drift; the main chat receives owner briefs and decisions.
- Deterministic wrappers resolve the repository from `BOURBON_SIGNAL_REPO`, the current directory, or a trusted live cron `workdir`; they no longer assume Hermes executes attached scripts from the job workdir.
- Deterministic wrappers exit nonzero on subprocess or report-contract failures and retain the actionable error rather than the trailing Node.js version line.
- Scheduler reconciliation binds SHA-256 safety hashes over agent prompts, skill lists, and enabled toolsets without exporting prompt text.
- North Carolina `nc_board_shipment_snapshot` rows remain strong official-source planning signals (0.90 normalized confidence) while staying non-inventory and non-watch-alertable because a board shipment is not exact shelf stock.
- Arizona's bounded legacy precision lane gets one 300-second attempt rather than two 120-second attempts, allowing its multi-source collector to complete without weakening quality-regression gates.

## Rollback

1. Pause the affected Hermes job with `hermes cron pause <job-id>` or the scheduler tool.
2. Restore schedules from the prior `automation/bourbon-signal/hermes-jobs.json` revision and run `python scripts/reconcile_hermes_jobs.py`.
3. Revert the GitHub workflow schedule commit to return shadow/browser jobs to their prior cadence.
4. Set `BOURBON_SIGNAL_BRAVE_CACHE_MAX_AGE_HOURS` higher to reduce search API traffic without altering evidence gates.
5. Never roll back by weakening publication, promotion, source-authority, freshness, or alert-delivery controls.

The sanitized live scheduler export is generated by `python scripts/export_hermes_jobs.py`. Reconciliation verifies job IDs, schedules, destinations, execution class, scripts, workdir, timezone, model, provider, and reasoning.
