# Automatic coverage completion

The owner authorized automatic handling through release on October 12, 2026. This replaces the previous research-only policy. New member requests enter the existing production queue and receive one final Complete or Failed report through the configured operations channel. Routine progress messages and customer emails are not sent.

Hermes job `0af9a869e52a` checks every 30 minutes using `bourbon_signal_coverage_request_complete.py`. The launcher forces `BOURBON_SIGNAL_COVERAGE_MODE=guarded_release` and runs the standalone dispatcher installed at `HERMES_HOME/automation/coverage-request-agent.mjs`. Keep the installed file identical to tested repository source. The gateway and scheduled job run on this Windows machine; it must stay online and awake. No always-on cloud worker has been provisioned.

The coverage project uses `C:/Users/chand/projects/bs-coverage-research-base`, with an isolated worktree per attempt. Immutable job key plus request version determines task identity. Reopened attempts cannot return an old finished task. Queue leases serialize work; overlapping requests reuse valid source research. Each worker has two hours, 24 turns, and one retry. Waiting for an occupied release lane is not proof of a failed source.

A worker checks exact geography and current evidence, implements a defensible fix, tests and reviews it, and releases only through the existing production-backed capability and shared release-lane guard. Completion requires production verification and a useful target-level gain. Directories, shipment leads, stale reports, merges, and workflow success alone do not establish current inventory coverage.

If a state or city is already fully covered, the trusted completion endpoint independently checks current canonical coverage and closes the request. Ordinary worker results cannot forge this closure. County and store requests require target-level expansion proof; broad state evidence cannot close them. To preserve the current database contract, verified existing coverage is stored with the internal blocked outcome and `already_covered` code, while its request is closed and its owner report says Complete. No new inventory gain is claimed.

A bounded unsuccessful attempt produces Failed with a reason and limitations. Engine-only changes are not reported as a fulfilled coverage request. Failed coverage remains unfulfilled in the member system and does not restart continuously. The notification outbox stores a delivery receipt and refuses automatic duplicate sends after an uncertain delivery.

Pause with `hermes cron pause 0af9a869e52a`. Pausing future checks does not stop a worker already running. Keep unrelated paused jobs paused. Customer messages and changes outside coverage remain separate from this authority.

On October 11, twelve open requests were audited. Virginia statewide, Sterling, and Glen Allen were closed as already covered. Nine remaining requests cover South Carolina, Indiana, Massachusetts, North Carolina statewide, and Forsyth, Nash, Edgecombe, Jones, and Onslow counties. Research-only attempt failures were superseded before enabling completion; historical evidence remains in retry history.
