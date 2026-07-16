# Retailer acquisition

Retailer acquisition is an owner-operated prospect system. It is intentionally separate from the existing retailer application, verification, portal, and direct signal-publishing flow. Existing retailer applications continue to use `pending`, `verified`, and `rejected`; acquisition prospects use their own lifecycle and tables.

## Lifecycle

The normal path is:

`discovered → qualified → contact_verified → draft_ready → awaiting_approval → approved → contacted → follow_up_due → contacted → interested → onboarding → verified → first_signal_live`

`paused`, `declined`, and `invalid` are explicit off-ramps. A prospect can only enter `contact_verified` when verified official-contact evidence exists. `approved` is only entered by approving one exact immutable draft version.

## Safety boundaries

- The application has no acquisition mail, messaging, or telephony integration.
- Discovery, ranking, and drafting commands only read and write local JSON artifacts.
- An outreach ledger entry can only reference a message version whose database status is `approved`.
- The database function locks the prospect and checks its state, approved version, and counters before inserting an outreach record. The ledger channel is copied from that approved version; callers cannot supply another channel, and a composite foreign key enforces the match.
- A unique `(prospect_id, kind)` constraint and a guarded `follow_up_count` allow one initial contact and at most one follow-up.
- The owner UI says “record” because it logs work completed elsewhere; it never sends.
- Outcome reporting is grouped in SQL by state and outcome. It returns counts only, with no retailer or contact identities.
- Draft copy contains no audience-size, reach, impression, or performance claims. Measured demand can inform rank but is not inserted into outreach copy.

## Normalization and dedupe

`normalizeRetailerProspect` standardizes state codes, ZIP codes, URLs, US phone numbers, whitespace, and city casing. `buildProspectDedupeKeys` creates:

- an identity key from normalized name and location;
- a location key from the physical address and market;
- a domain key for review of possible multi-location relationships.

Repository discovery automatically reuses an existing prospect on exact identity or location matches. A shared domain is indexed for review but is not an automatic duplicate because chains can have distinct locations.

## Scoring

The score is transparent and capped at 100:

| Component | Maximum | Inputs |
| --- | ---: | --- |
| Aggregate demand | 30 | 30-day searches, saved alerts, watchlist matches |
| Coverage gap | 30 | known market stores, covered stores, 30-day city signals |
| Retailer fit | 25 | independent, bourbon specialist, live-inventory gap |
| Evidence quality | 15 | official contact, official website, physical location |

Missing numeric inputs become zero. The score preserves its input snapshot and rationale; it does not estimate audience or reach.

## Official-contact evidence

Accepted evidence is limited to an email, phone number, or contact form published on the retailer’s HTTPS domain, or a contact value on an allowlisted regulator domain. Regulator evidence must select an authority whose id, name, and domain exactly match the controlled authority registry; the source URL must be HTTPS on that domain or a subdomain. The database stores the authority metadata behind a foreign key. General directories and caller-invented authority domains do not qualify.

## Local artifact workflow

Discovery, ranking, and drafting require explicit input and output paths and do not modify the database:

```powershell
npm run acquisition:discover -- --input engine/data/discovery/SC-retailer-candidates.json --output data/retailer-acquisition/sc-discovered.json --source sc-engine-candidates
npm run acquisition:rank -- --input data/retailer-acquisition/sc-discovered.json --demand data/retailer-acquisition/sc-demand-aggregates.json --coverage data/retailer-acquisition/sc-coverage.json --output data/retailer-acquisition/sc-ranked.json
npm run acquisition:draft -- --input data/retailer-acquisition/sc-contact-verified.json --output data/retailer-acquisition/sc-drafts.json
```

The demand and coverage files use a `markets` object keyed by normalized `city|ST`. For example:

```json
{
  "markets": {
    "taylors|SC": {
      "searches30d": 24,
      "savedAlerts": 8,
      "watchlistMatches": 5,
      "marketStores": 30,
      "coveredStores": 9,
      "citySignals30d": 2
    }
  }
}
```

Ranking reads demand and coverage from their respective documents. Drafting requires `prospectState: "contact_verified"` plus `officialContact.verified: true`, a supported channel, and an evidence identifier. Its output remains a draft artifact with `approvalRequired: true`.

## Validated prospect import

The import command accepts either the discovery artifact (`prospects`) or ranking artifact (`ranked`). It validates every prospect before doing any database work, recomputes ranking scores from validated score inputs, requires the exact owner email, and emits a new audit JSON file. It is a dry run unless `--apply` is present:

```powershell
npm run acquisition:import -- --input data/retailer-acquisition/sc-ranked.json --audit data/retailer-acquisition/audits/sc-import-dry-run.json --owner <owner-email>
npm run acquisition:import -- --input data/retailer-acquisition/sc-ranked.json --audit data/retailer-acquisition/audits/sc-import-apply.json --owner <owner-email> --apply
```

The audit path is created exclusively so a prior audit cannot be overwritten. Apply mode uses the repository’s idempotent prospect upsert: an existing identity or physical location is reported as deduplicated instead of creating another admin row. The importer only writes prospect records. It cannot draft, approve, send, or record outreach.

## Controlled schema migration

Request-time repository code contains no `CREATE`, `ALTER`, or function-definition SQL. Apply the reviewed schema with a privileged deployment identity before serving the admin route or running an apply import:

```powershell
npm run migrate:retailer-acquisition
```

The migration creates or upgrades the prospect tables, regulator authority registry, channel constraints, transaction functions, and migration ledger, then verifies each required object. Runtime performs a read-only availability check and fails with an instruction to run this command when any required schema object is absent. All subsequent repository operations are queries and DML only.

## Owner console

`/admin/retailer-acquisition` uses the same single-owner authorization as existing retailer administration. Imported prospect rows are read by `listProspects` and appear in its work queue. The console exposes evidence capture, lifecycle actions, draft generation, exact-version approval packets, the manual outreach ledger, and aggregate outcomes. The outreach ledger displays the approved channel as read-only because the repository and SQL derive it from the approved message version.
