# Coverage request research

New member requests already enter the durable production queue. The owner chose automatic checking and research, with proposed fixes reviewed before release.

The existing Hermes job `0af9a869e52a` checks every 30 minutes. It uses `bourbon_signal_coverage_request_review.py`, which forces `BOURBON_SIGNAL_COVERAGE_MODE=review`, and a standalone dispatcher installed at `HERMES_HOME/automation/coverage-request-agent.mjs`. The runtime is independent of a feature branch checkout. Keep that installed file identical to the tested repository source when updating it.

The project uses `C:/Users/chand/projects/bs-coverage-research-base` as its primary repository. Each research task gets its own worktree. Jobs remain serialized by the production queue; task keys prevent duplicate creation. The research limit is 45 minutes, eight turns, and one retry, compared with the previous eight-hour, 50-turn release task.

Research checks current coverage for the exact requested geography, distinguishes directories and shipment leads from fresh inventory, and records reviewed public sources. Access restrictions are blockers. A safe fix can become a local tested patch or the sole draft PR when the release lane is empty. A current PR keeps other patches in their task workspaces.

Research mode does not persist or bind a release capability, run the outgoing notification outbox, or accept a result claiming a production improvement. An audited research result remains `blocked` with `owner_review_required`, so the existing result contract keeps coverage open and does not label an unreleased fix as an improvement. Partial audits must not claim completeness. Inspect the task's evidence and patch before approving a fix; use the guarded release lane for any approved deployment.

Pause with `hermes cron pause 0af9a869e52a`. Pausing stops future queue checks; it does not cancel a research task already running. Keep unrelated paused jobs paused. The historical `guarded_release` mode requires a separate explicit owner decision; the research launcher always overrides it.

On October 11, 2026, twelve open requests were audited. Virginia statewide, Sterling, and Glen Allen were closed as already covered. Nine unresolved requests were reviewed and requeued: South Carolina, Indiana, Massachusetts, North Carolina statewide, and Forsyth, Nash, Edgecombe, Jones, and Onslow counties. The audit did not claim new inventory. Member status notes and owner audit entries were saved through the existing repository methods.

Automation cost reports ignore repeated run IDs within a job. Missing result counters remain unknown. Cost-without-results recommendations require five runs with all result counters recorded; recommendations do not automatically pause work. Reports contain aggregate counts, without prompts, account identifiers, source queries, or worker logs.
