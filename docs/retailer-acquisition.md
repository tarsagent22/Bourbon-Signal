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
- The database function locks the prospect and checks its state, approved version, and counters before inserting an outreach record.
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

Accepted evidence is limited to an email, phone number, or contact form published on the retailer’s HTTPS domain, or a contact value on an HTTPS regulator listing. The owner must preserve the exact source URL and verification timestamp. General directories do not qualify.

## Local artifact workflow

Commands require explicit input and output paths and do not modify the database:

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

## Owner console

`/admin/retailer-acquisition` uses the same single-owner authorization as existing retailer administration. It exposes evidence capture, lifecycle actions, draft generation, exact-version approval packets, the manual outreach ledger, and aggregate outcomes. Schema creation is handled by `RetailerProspectRepository.ensureSchema`; the standalone SQL contract is in `src/lib/retailer-prospect-schema.sql` for review and controlled migrations.
