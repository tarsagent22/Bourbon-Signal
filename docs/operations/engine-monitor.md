# Deterministic engine monitor

The Windows task `BourbonSignalEngineMonitor` runs a dependency-free Node worker every five minutes. It checks public production health, and enriches records with public stats/Coverage only on a changed snapshot or once an hour. It never calls an AI model, changes source code, merges, or publishes a local snapshot.

At twenty minutes of collection age it checks the canonical GitHub refresh workflow. Queued, pending, waiting and running jobs all prevent another dispatch. A dispatch always targets `refresh-feed.yml` on `main` without forcing states or bypassing publication checks. The existing GitHub workflow retains current-main authority, state admission, atomic activation and rollback. This controller never targets Ohio or tries to repair a source partition merely because it is degraded.

Three attempts are allowed until newer, healthy production collection is accepted. Attempts are reserved durably before the request, so a lost response consumes the attempt rather than causing an immediate duplicate. Retries wait 15/30/60 minutes. An exhausted budget needs investigation; a changed commit, export timestamp, or snapshot ID cannot replenish it.

Two failed checks open one incident. Changing the diagnostic text or snapshot keeps that incident open. Two healthy checks with newer accepted collection close it. Windows desktop alerts are limited to those two transitions. Delivery failures get at most three attempts with one stable Windows toast tag, and retries suppress another popup. `accepted_by_windows` proves submission to Windows, not that the owner read it. Durable incident events and notification results remain in the evidence directory if desktop notifications are disabled.

## Installation

Run the installer from a clean checkout of the exact reviewed/merged commit:

```powershell
./scripts/install-engine-monitor.ps1 -ExpectedCommit <40-character-sha>
```

This installs observation-only mode. After guarded release, reinstall with `-EnableDispatch -EnableNotifications`. `-ImportKnownIncident` may be used once when the incident was actually reported in the owner chat; it suppresses a duplicate migration alert. Never infer delivery from a prepared message.

The installer copies just the runner and policy module into the stable local operations directory and records their SHA-256 hashes and commit. It uses the existing signed-in GitHub CLI credential locally; no broad GitHub token is copied to production. No administrator rights or new hosted service is required. The task uses least privilege, hidden windows, overlap prevention, wake-from-sleep, a logon check, missed-start recovery and a four-minute execution limit.

This host must be powered on with the owner signed in. Waking from sleep cannot start a powered-off machine. GitHub's existing cloud schedules remain a fallback. A dedicated cloud controller would require an independently provisioned runner or repository-scoped GitHub App credential; do not describe the Windows task as independent of the host.

Both the cloud watchdog and the refresh workflow's post-publication recovery planner explicitly exclude Ohio from targeted recovery. An excluded-only source incident must never turn into a full refresh. Genuine global pipeline recovery still uses the normal guarded refresh path.

## Evidence and final review

The evidence directory defaults to the existing acceptance directory under `.codex/operations/bourbon-signal/engine-freshness-20261015`. `monitor-last-run.json` records actual task results and dispatch decisions. `deterministic-monitor-state.json` holds the incident and retry budgets. `observations.jsonl` preserves the one-time acceptance observations, including failures collected by the previous hourly AI observer. The acceptance window is never restarted or cleared during migration. Its last sample and summary are frozen after at least 24 hours; malformed records remain incomplete evidence. Routine service records continue in daily `monitor-observations` files, so the task does not repeatedly scan an indefinitely growing historical log.

Replace the hourly AI heartbeat with one final review after the original 24-hour window. That review must inspect monitoring gaps, guarded refresh runs, source acceptance, backup proof and actual delivery evidence, then pause itself regardless of pass/fail. Public HTTP success or a successful task exit alone is not acceptance.
