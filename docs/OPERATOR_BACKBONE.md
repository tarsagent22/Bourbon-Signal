# Bourbon Signal operating backbone

This backbone turns existing aggregate operating signals into a bounded GitHub Issues backlog and chooses one objective at a time. It is observational by default. It does not authorize publishing, sending, deploying, production changes, or cron changes.

## Safety model

- Every new command defaults to dry-run.
- GitHub issue creation, edits, closing, and reopening require `--apply`.
- Writing a scorecard, daily brief, weekly review, or Radar finding report requires `--apply`.
- Creating an objective lock and its branch requires `--apply` and a clean base worktree. Production automation supplies `--worktree` so the objective branch is isolated instead of switching the canonical checkout.
- No command sends messages, deploys code, changes a schedule, or writes production data.
- The scorecard selects aggregate counters from the Control Room snapshot. It never carries email addresses, user IDs, or per-member records.

## Canonical finding contract

One finding is one possible unit of operator work. The contract version is `bourbon-signal/finding@1`; a report contains at most eight findings, and each finding contains at most five evidence strings. IDs are deterministic SHA-256-derived identifiers over `source` plus `sourceKey`, so repeated observations upsert the same issue.

Upsert recurrence is observational only. For an existing issue it refreshes the area, severity, title, summary, evidence, recommended action, rank inputs, and observation time. It preserves the operator-owned lifecycle status and the GitHub open/closed state for every status. In particular, a recurring `resolved` or `dismissed` finding stays terminal and closed; reopening requires an explicit `operator:findings update --status backlog|selected|in-progress --apply` action.

Required fields:

- `id`: `bsf-` plus 16 lowercase hexadecimal characters
- `source`: `daily-reliability`, `weekly-engine-brief`, `source-roi`, `release-radar`, or `company-scorecard`
- `sourceKey`: stable identity within that source
- `area`: `company`, `product`, `data`, `shipping`, or `decision`
- `severity`: `critical`, `high`, `medium`, or `low`
- bounded `title`, `summary`, `evidence`, and `recommendedAction`
- integer `impact`, `urgency`, and `effort` from 1–5
- numeric `confidence` from 0–1
- `status`: `backlog`, `selected`, `in-progress`, `blocked`, `resolved`, or `dismissed`
- `observedAt`: an ISO date-time

The JSON fenced block following `<!-- bourbon-signal-finding:v1 -->` is canonical in GitHub. `.github/operator-finding.schema.json` is the machine-readable schema, and the issue form at `.github/ISSUE_TEMPLATE/operator-finding.yml` uses the same shape.

Rank score is deterministic:

```text
impact*40 + urgency*30 + confidence*20 + severityWeight - effort*10
```

Ties sort by finding ID.

## Signal adapters

The existing commands retain their current reports and now add a top-level, bounded `findings` array:

- `npm run ops:daily`
- `npm run ops:weekly`
- `npm run ops:source-roi`

Radar scouting has an isolated adapter:

```bash
npm run ops:radar-findings
npm run ops:radar-findings -- --apply
```

Only stories in the scouting ledger with status `reported` become findings. The adapter never changes Release Radar content or publishes a story.

## Company scorecard

The Control Room server snapshot now includes `scorecard`. For offline generation, provide an aggregate Control Room snapshot:

```bash
npm run ops:scorecard -- --input path/to/control-room-snapshot.json
npm run ops:scorecard -- --input path/to/control-room-snapshot.json --apply
```

The machine-readable scorecard has Company, Product, Data, Shipping, and Decision dimensions. `--apply` writes timestamped and `latest` JSON under the ignored automation reports directory.

To read the live aggregate scorecard, configure a dedicated `COMPANY_SCORECARD_READ_SECRET` on the web app and in the read job. This secret authorizes only `GET /api/ops/company-scorecard`; do not reuse `CRON_SECRET` or any delivery/send-capable credential. The command is a dry run unless `--apply` is supplied:

```bash
npm run ops:scorecard:fetch
npm run ops:scorecard:fetch -- --apply
```

The fetcher accepts only these exact HTTPS origins: `https://www.bourbonsignal.com`, `https://bourbonsignal.com`, `https://localhost:3000`, `https://127.0.0.1:3000`, and `https://[::1]:3000`. `--url` and `BOURBON_SIGNAL_BASE_URL` may select one of them, but paths, credentials, HTTP, redirects, and all other origins are rejected before the Authorization header is created.

For cron, keep the secret in a permission-restricted environment file rather than the crontab. The environment file can also set the allowlisted production origin with `BOURBON_SIGNAL_BASE_URL=https://www.bourbonsignal.com`. A cron-compatible command is:

```cron
17 6 * * * cd /srv/bourbon-signal && /usr/bin/node --env-file=/etc/bourbon-signal/scorecard.env --no-warnings --experimental-strip-types automation/bourbon-signal/fetch-company-scorecard.mjs --apply >> /var/log/bourbon-signal-scorecard.log 2>&1
```

## Daily and weekly operating records

The daily generator emits exactly these Markdown sections in this order: Company, Product, Data, Shipping, Decision, Today.

```bash
npm run operator:daily-brief -- --scorecard path/to/scorecard.json --findings path/to/findings.json
npm run operator:daily-brief -- --scorecard path/to/scorecard.json --findings path/to/findings.json --apply
npm run operator:daily-brief -- --scorecard path/to/scorecard.json --github-backlog path/to/operator-findings-read.json

npm run operator:weekly-review -- --scorecard path/to/scorecard.json --findings path/to/findings.json
npm run operator:weekly-review -- --scorecard path/to/scorecard.json --findings path/to/findings.json --apply
npm run operator:weekly-review -- --scorecard path/to/scorecard.json --github-backlog path/to/operator-findings-read.json
```

`--github-backlog` accepts the canonical JSON emitted by `operator:findings read` and is the preferred brief input after GitHub lifecycle changes. It preserves the one selected or in-progress objective even when that finding falls below the normal eight-item rank cutoff. `--github-backlog` and `--findings` are mutually exclusive. When both are omitted, the generators read the latest daily reliability, weekly engine, source ROI, and Radar reports. Missing finding reports are allowed; the scorecard is required.

## GitHub backlog commands

All GitHub access uses the authenticated `gh` CLI. Read and rank are read-only. Upsert and update print a deterministic plan unless `--apply` is present.

```bash
npm run operator:findings -- validate --file findings.json
npm run operator:findings -- read --repo OWNER/REPO
npm run operator:findings -- rank --repo OWNER/REPO
npm run operator:findings -- rank --file findings.json
npm run operator:findings -- upsert --file findings.json --repo OWNER/REPO
npm run operator:findings -- upsert --file findings.json --repo OWNER/REPO --apply
npm run operator:findings -- update --id bsf-0123456789abcdef --status resolved --repo OWNER/REPO
npm run operator:findings -- update --id bsf-0123456789abcdef --status resolved --repo OWNER/REPO --apply
```

Repository labels referenced by the issue form and upsert command must already exist: `operator-finding`, `area:*`, `severity:*`, and `status:*`.

The repository milestone `Bourbon Signal Operating Backlog` is the canonical human-readable board, and the backlog index issue links the all, selected, in-progress, blocked, approval-required, and resolved views. A GitHub Project may mirror those issues when the authenticated token has Projects v2 scope, but Project membership is presentation only: issue bodies and lifecycle labels remain authoritative.

## Single-objective policy

Only one lock may exist. An existing `selected` or `in-progress` finding retains the objective regardless of new rank; more than one active finding is a contract failure. Otherwise selection excludes resolved, dismissed, and blocked findings and chooses the highest deterministic rank. The branch is always `operator/<finding-id>-<title-slug>`.

```bash
npm run operator:objective -- status
npm run operator:objective -- select --file ranked-or-canonical-findings.json
npm run operator:objective -- select --file ranked-or-canonical-findings.json --issue-number 123 --worktree ../Bourbon-Signal-operator-current --apply
npm run operator:objective -- release
npm run operator:objective -- release --worktree ../Bourbon-Signal-operator-current --apply
```

Dry-run selection does not write `.operator/objective-lock.json` and does not create or switch branches. Applied selection refuses a dirty base worktree, an existing lock, or an existing objective branch. With `--worktree`, the objective branch starts from `main` in that isolated path and the canonical checkout stays on `main`; omitting it retains the manual branch-switch behavior. `--base release/<name>` is the only alternate base policy. Release validates the locked branch in the supplied objective worktree and requires `--apply` to delete the lock.

## Verification

```bash
npm run test:operator-backbone
npm run test:operations-dashboard
```

The operator test covers contract rejection, stable IDs, bounded adapters, issue body round-tripping, `gh` dry-run safety, aggregate-only scorecards, exact daily sections, weekly objective ranking, and lock/branch policy.
