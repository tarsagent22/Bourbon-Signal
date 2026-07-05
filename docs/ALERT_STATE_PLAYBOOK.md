# Bourbon Signal Alert Playbook

_Last updated: 2026-07-05 from current `engine/out/site` exports._

## Purpose

Bourbon Signal alerts should turn messy public/retailer/state signals into a trusted member promise:

> Tell a member when a bottle worth chasing appears in a market they care about, with honest context about how actionable the signal is.

The alert system is not just a notification pipe. It is the trust layer between source data and a member's decision to drive, buy, wait, or ignore.

## Alert lifecycle: stage by stage

### Stage 0 — Source discovery and eligibility

**Goal:** Decide whether a source belongs in the alert system at all.

A source is alert-capable only if it has at least one of these:

- Fresh store-level inventory rows
- Store-level delivery/allocation leads
- Board/county/warehouse drops that reliably precede shelf availability
- Official limited release / distillery drop signals
- Verified retailer warehouse inventory rows

A source is **not** alert-capable if it is only:

- Licensing data
- Policy/legal pages
- General product catalog with no availability signal
- Historical-only data
- Unverified scraped text
- Member sighting data, until the sightings trust/reputation loop is ready

### Stage 1 — Signal normalization

**Goal:** Convert raw source rows into comparable operational signals.

Every alert-bound signal needs:

- `state`
- `eventType`
- `bottle` / canonical bottle identity
- `tier` (`unicorn`, `allocated`, `limited`, etc.)
- `locationPrecision`
- `source` / `sourceUrl` where possible
- freshness timestamp or freshness confidence
- quantity or availability label when available
- caution/blocker labels when the source has caveats

### Stage 2 — Bottle-worthiness filter

**Goal:** Do not alert on ordinary shelf noise.

Default alert-worthy tiers:

- `unicorn`
- `allocated`
- `limited`

Suppress from outbound email/SMS unless explicitly requested:

- core/shelf bottles
- unknown bottle matches
- ambiguous aliases
- bottles with low-confidence canonical matching

On-site can be slightly broader than SMS/email, but it should still avoid clutter.

### Stage 3 — Actionability classification

**Goal:** Separate “go now” alerts from “watch this” intelligence.

Recommended classes:

| Class | Meaning | Default channels |
|---|---|---|
| `store_inventory` | Store-level availability/in-stock/pickup row | on-site, email, SMS for major/high-confidence |
| `store_delivery_lead` | Delivery/allocation row; strong lead but not shelf guarantee | on-site, email for major; SMS only for unicorn/high confidence |
| `board_or_county_lead` | Board/county/warehouse signal that may map to stores later | on-site; email if highly allocated/unicorn; SMS only with strong copy caveat |
| `distillery_release_watch` | Official distillery/release/drop signal | on-site/email; SMS only for user-selected KY/distillery watch |
| `retailer_warehouse_watch` | Costco/warehouse-style fast-moving inventory | on-site; email/SMS only when location is verified and fresh |
| `aggregate_watch` | County/state aggregate inventory without exact store | on-site only by default |
| `policy_or_catalog_context` | Useful market context but not actionable | no alerts |

### Stage 4 — Freshness guardrails

**Goal:** Prevent stale alerts from damaging trust.

Hard rules:

- Unknown freshness: no email/SMS.
- Bootstrap/manual refresh quarantine: no email/SMS.
- Explicit stale blocker: no delivery.
- Member sightings: no automatic outbound alerts yet.

Default maximum freshness windows:

| Signal type | On-site | Email | SMS |
|---|---:|---:|---:|
| Store-level inventory | 24h max, prefer <6h | 24h | 6–12h for SMS |
| Store delivery/allocation lead | 24–36h if source is known slow-moving | 24h | 6–12h, major only |
| Board/county/warehouse lead | 24–36h on-site with caveat | 24h for major only | avoid unless unicorn + strong confidence |
| Distillery release watch | release-window dependent | release-window dependent | only if user opted into that state/watch |
| Retailer warehouse inventory | 12h max | 6–12h | 3–6h |
| Aggregate inventory watch | 24h on-site only | avoid | avoid |

Current note from 2026-07-05 export: NC board/warehouse candidates can exceed 24h (observed max ~35.5h). Those should remain caveated and should be considered on-site/lead-style unless tightened per source.

### Stage 5 — Member preference match

**Goal:** Only notify when it matches a member’s saved intent.

Required checks:

- paid tier active
- saved area preferences exist
- alert channel enabled
- state/area match
- bottle mode match:
  - `anything_notable`: allowed for rare/allocated/limited
  - `specific_bottles`: candidate must match saved bottle aliases/keys
- user-specific channel mode:
  - email all vs major-only vs daily roundup
  - SMS major-only vs specific bottle

No saved area prefs = no personalized alerts. The dashboard/onboarding should treat this as an activation gap.

### Stage 6 — Ranking and throttling

**Goal:** Send the best signal, not every signal.

Rank by:

1. member specificity: exact saved bottle > anything notable
2. actionability: store-level inventory > delivery lead > board/warehouse lead > aggregate
3. tier: unicorn > allocated > limited
4. freshness
5. reliability score
6. quantity if known
7. state/source diversity

Default throttles:

- on-site: 1 new alert/user/run
- email: 1/user/run, conservative global cap
- SMS: strict cap; major/specific only
- dedupe by candidate/channel/user for at least 24h

### Stage 7 — Delivery channel policy

**On-site inbox**

- Default safe channel.
- Can include caveated leads.
- Should be concise but transparent.
- Should never create alerts as a side effect of merely reading the inbox.

**Email**

- Use for high-confidence, fresh, user-matched signals.
- Subject should stay factual: “Fresh signal detected: Bottle at Location.”
- Avoid stale/caveated aggregate leads unless major and clearly framed.

**SMS**

- Highest trust bar.
- Use only for fresh, high-priority, verified/consented users.
- Include verify-before-driving and STOP language.
- Avoid ambiguous aggregate/county-only alerts by default.

### Stage 8 — Copy and trust labels

Every alert should make the source semantics obvious.

Recommended labels:

- **Store inventory** — “reported at [store]”
- **Delivery lead** — “delivery/allocation lead for [store]”
- **Board/county lead** — “board-level lead; verify before driving”
- **Warehouse watch** — “warehouse-level signal; may not mean shelf inventory”
- **Distillery release watch** — “official distillery/release signal”
- **Aggregate watch** — “area-level signal; exact store may vary”

Avoid overclaiming words unless source supports them:

- “in stock”
- “available now”
- “at this exact store”
- “go now”

### Stage 9 — Monitoring and audit

Daily alert health should report:

- candidates by state
- candidates by tier
- candidates by actionability class
- max/median freshness by state/source
- matched paid users
- skipped paid users with no preferences
- on-site/email/SMS sent/would-send counts
- dedupe counts
- delivery errors
- top suppressed reasons

Weekly Sol-level audit should review false positives/false negatives and tune policy.

---

# State alert playbook

## Current active states and lanes

Current export reports 22 active states/lanes. Only states with current alert candidates should send member alerts today; states with zero current actionable signal should remain watch/onboarding-visible but quiet until verified candidates exist.

## NC — North Carolina

**Source:** North Carolina ABC + county boards  
**Coverage tier:** live store inventory + board/warehouse leads  
**Current lifecycle:** `store_inventory_and_board_leads`  
**Best precision:** store level for selected county boards; board/county/warehouse for broader leads  
**Current candidates:** 63; mostly allocated, with board/county and warehouse lead events

**Alert semantics:**

- Treat NC as mixed precision.
- Store-level county-board rows can be normal store inventory alerts.
- Statewide warehouse and board shipment rows are **leads**, not exact shelf inventory.

**Allowed channels:**

- Store-level: on-site/email/SMS if fresh and rare enough.
- Board/county lead: on-site by default; email for major/unicorn/strong allocated; SMS only for unicorn or explicit user preference.
- Warehouse lead: on-site with caveat; email only for major/unicorn; SMS generally avoid.

**Freshness:**

- Store-level: 24h max.
- Board/warehouse lead: prefer 24h; allow up to 36h on-site with caveat only.
- If NC lead freshness exceeds 24h, label as lead/watch, not “fresh inventory.”

**Copy:**

> Board-level lead for your NC area. Verify with the board/store before driving.

## VA — Virginia

**Source:** Virginia ABC  
**Coverage tier:** live store inventory  
**Lifecycle:** `store_inventory`  
**Best precision:** store level  
**Current candidates:** 114; allocated store inventory rows

**Alert semantics:**

- Strong store-level market.
- Good candidate for paid member alerts.
- Limited-availability caveats still matter.

**Allowed channels:**

- On-site: yes.
- Email: yes for allocated/unicorn/limited with fresh store-level rows.
- SMS: yes for major/unicorn/specific bottle, strict freshness.

**Freshness:**

- Email <=24h.
- SMS preferably <=6–12h.

**Copy:**

> Store-level Virginia ABC signal. Verify availability before driving.

## PA — Pennsylvania

**Source:** FWGS / PLCB  
**Coverage tier:** live store inventory  
**Lifecycle:** `store_inventory`  
**Best precision:** store level  
**Current candidates:** 12; mostly unicorn store inventory rows

**Alert semantics:**

- Strong if store row is current and source extraction confirmed.
- Store/county preferences should matter.

**Allowed channels:**

- On-site: yes.
- Email: yes for unicorn/allocated/limited fresh rows.
- SMS: yes for unicorn/specific bottle, strict freshness.

**Freshness:**

- Email <=24h.
- SMS <=6–12h.

**Copy:**

> FWGS store pickup/inventory signal. Verify before driving or ordering.

## IA — Iowa

**Source:** Iowa ABD + Costco warehouse watch  
**Coverage tier:** store delivery leads  
**Lifecycle:** `store_delivery_leads`  
**Best precision:** store level  
**Current candidates:** none in current alerts export

**Alert semantics:**

- Delivery/allocation rows are strong leads, not guaranteed shelf inventory.
- Good on-site/email market when candidates exist.

**Allowed channels:**

- On-site: yes.
- Email: yes for major/high-confidence delivery leads.
- SMS: only for unicorn/specific bottle with very fresh delivery rows.

**Freshness:**

- Delivery lead <=24h for email.
- SMS <=6–12h.

**Copy:**

> Iowa delivery/allocation lead. Store availability can change; verify before driving.

## ID — Idaho

**Source:** Idaho State Liquor Division  
**Coverage tier:** store availability status  
**Lifecycle:** `store_availability_status`  
**Best precision:** store level  
**Current candidates:** none in current alerts export

**Alert semantics:**

- Store availability status is useful, but bottle-count/reservation guarantee may be absent.

**Allowed channels:**

- On-site: yes.
- Email: yes for rare fresh store-status rows.
- SMS: only for major/specific bottle and very fresh data.

**Copy:**

> Idaho store availability status; verify before driving.

## AL — Alabama

**Source:** Alabama ABC + Costco warehouse watch  
**Coverage tier:** shipment/drop intelligence  
**Lifecycle:** scheduled release leads  
**Best precision:** store level / board county depending row  
**Current candidates:** none in current alerts export

**Alert semantics:**

- Alabama is release/drop intelligence, not simple live shelf inventory.
- Best for release reminders and high-confidence store/drop leads.

**Allowed channels:**

- On-site: yes for release/drop leads.
- Email: yes for official limited-release/allocated events.
- SMS: only for explicit opted-in major release alerts.

**Copy:**

> Alabama limited-release/drop lead. Confirm timing and store details before driving.

## IL — Illinois

**Source:** Binny's + Costco + retailer inventory watch  
**Coverage tier:** live store inventory  
**Lifecycle:** retailer store inventory  
**Best precision:** store level  
**Current candidates:** none or minimal current alerts depending refresh

**Alert semantics:**

- Retailer-specific inventory rows can be actionable but fast-moving.
- Treat Costco/retailer rows as verified retailer signals, not statewide truth.

**Allowed channels:**

- On-site: yes.
- Email: yes if fresh and store-level.
- SMS: only for unicorn/specific bottle with very fresh store-level signal.

**Freshness:**

- Retailer inventory preferably <=12h.
- SMS <=3–6h.

**Copy:**

> Retailer inventory signal; fast-moving stock, verify before driving.

## IN — Indiana

**Source:** ATC + Costco + retailer inventory watch  
**Coverage tier:** live store inventory  
**Lifecycle:** retailer store inventory  
**Best precision:** store level  
**Current candidates:** 1 allocated store-level retailer row

**Alert semantics:**

- Retailer inventory can alert.
- ATC/license context must not become bottle availability.

**Allowed channels:**

- On-site: yes.
- Email: yes for fresh store-level rows.
- SMS: only major/specific bottle and very fresh.

**Copy:**

> Indiana retailer inventory signal. Verify before driving.

## TN — Tennessee

**Source:** Tennessee ABC + retailer inventory watch  
**Coverage tier:** live store inventory  
**Lifecycle:** retailer store inventory  
**Best precision:** store level  
**Current candidates:** 5 mostly unicorn retailer rows

**Alert semantics:**

- Retailer e-commerce rows are alertable when whitelisted and fresh.
- Official ABC pages are policy context only.

**Allowed channels:**

- On-site: yes.
- Email: yes for rare fresh rows.
- SMS: unicorn/specific bottle only.

**Copy:**

> Tennessee retailer inventory signal. Verify with the retailer before driving.

## SC — South Carolina

**Source:** Costco + retailer inventory mesh  
**Coverage tier:** live store inventory  
**Lifecycle:** retailer store inventory  
**Best precision:** store level  
**Current candidates:** 5 unicorn store-level retailer rows

**Alert semantics:**

- Retailer inventory rows are useful when whitelisted.
- DOR/ABL pages are regulatory context only.

**Allowed channels:**

- On-site: yes.
- Email: yes for fresh rare rows.
- SMS: unicorn/specific bottle only.

**Copy:**

> South Carolina retailer inventory signal. Fast-moving; verify before driving.

## MD-MONTGOMERY — Maryland / Montgomery County

**Source:** Montgomery County ABS  
**Coverage tier:** aggregate inventory watch  
**Lifecycle:** county aggregate inventory watch  
**Best precision:** store aggregate  
**Current candidates:** none in current alerts export

**Alert semantics:**

- Aggregate/county-level signal, not exact store inventory.
- Should be on-site first until exact per-store drilldown is hardened.

**Allowed channels:**

- On-site: yes for rare/high-confidence aggregate changes.
- Email: avoid unless major/unicorn and copy is explicit.
- SMS: avoid by default.

**Copy:**

> Montgomery County aggregate inventory signal. Exact store availability may vary.

## KY — Kentucky

**Source:** distillery drops + Costco warehouse watch  
**Coverage tier:** distillery release watch  
**Lifecycle:** distillery drop/release watch  
**Best precision:** distillery  
**Current candidates:** none in current alerts export

**Alert semantics:**

- Kentucky is not primarily a normal store-inventory alert market.
- Treat it as distillery release/drop watch plus verified warehouse signals.
- This needs separate member preference language: “distillery release alerts.”

**Allowed channels:**

- On-site: yes for release/drop watch.
- Email: yes for official release/drop alerts.
- SMS: only for opted-in KY/distillery/specific bottle alerts.

**Copy:**

> Kentucky distillery release/drop signal. Check official pickup/release terms before going.

## Costco / retailer warehouse watch states

States: AZ, CA, FL, GA, MI, MN, MO, NV, WA, WI, plus Costco lanes in AL, IA, IL, IN, KY, SC.

**Coverage tier:** retailer warehouse inventory  
**Lifecycle:** Costco warehouse bourbon watch  
**Precision:** warehouse when verified; some states currently have blocked/statewide-catalog precision and zero current signals

**Alert semantics:**

- Warehouse signals are fast-moving and location-specific when verified.
- If current signal count is zero or precision is blocked, do not send alerts.
- Treat as watch coverage until a verified warehouse row exists.

**Allowed channels:**

- On-site: yes when warehouse/location is verified and fresh.
- Email: only for rare/high-confidence warehouse rows.
- SMS: only for unicorn/specific bottle with very fresh warehouse confirmation.

**Freshness:**

- On-site <=12h.
- Email <=6–12h.
- SMS <=3–6h.

**Copy:**

> Costco/warehouse inventory signal. Stock moves quickly; verify with the warehouse before driving.

---

# Implementation recommendations

## 1. Add an explicit `actionabilityClass`

Add one normalized field to alert candidates:

- `store_inventory`
- `store_delivery_lead`
- `board_or_county_lead`
- `distillery_release_watch`
- `retailer_warehouse_watch`
- `aggregate_watch`
- `context_only`

This will make delivery policy simpler and less state-specific inside the delivery code.

## 2. Make freshness limits depend on actionability class

Current delivery uses a broad freshness guardrail. Move toward class/source-specific freshness windows so NC board leads, VA store rows, Costco warehouse rows, and KY distillery watch are not treated as the same kind of signal.

## 3. Separate on-site eligibility from email/SMS eligibility

A candidate can be safe for on-site but too caveated for outbound. Add booleans or policy result fields:

- `eligibleForOnSite`
- `eligibleForEmail`
- `eligibleForSms`
- `deliveryCaveat`

## 4. Add admin alert simulation

Before widening email/SMS, create an admin view/API that shows:

- candidate
- matched users count
- would-send by channel
- suppression reason
- copy preview
- freshness/actionability classification

## 5. Add daily playbook drift report

Every daily ops report should flag:

- states with candidates older than policy window
- states with candidates but no paid users
- paid users with preferences in states with no actionable coverage
- alertable candidates with missing source/copy fields
- sudden candidate spikes by state/source

## 6. Product copy alignment

State/member settings should not imply every state is equivalent. Use state-specific labels:

- “Store inventory alerts”
- “Delivery lead alerts”
- “Board/county lead alerts”
- “Distillery release alerts”
- “Warehouse watch alerts”

This makes the promise honest and improves trust.
