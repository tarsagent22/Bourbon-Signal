# Reachable-source expansion — October 22, 2026

The campaign expands existing public retailer integrations and skips known denied state routes. Source collection remains bounded, and failed candidates are dropped without unchanged retries.

| Change | Verified local result | Recurring request cost |
| --- | --- | --- |
| Florida ABC catalog depth | 1,905 → 2,800 policy-qualified store/product rows; 11 → 19 canonical bottles; additional inventory at 125 existing stores | Two additional requests |
| Existing NY/CO retailer depth | 26 → 40 canonical inventory variants at seven reviewed sources | Nine additional requests per ordinary four-hour sweep |
| New NY/CO premises | Eight stores; 22 matched collector signals; 13 public rows at all eight stores | Eight category requests and three proven family searches per ordinary sweep |

These are captured-source and offline pipeline measurements. They do not establish production publication, physical shelf counts, or notification delivery. New-store replay produces 13 onsite candidates; email/SMS eligibility remains zero under the current channel policy. New-store query matches are already included in the new-premises counts.

New customer areas are Rochester Metro, Hudson Valley, and Lake George in New York, plus Boulder County and Colorado Springs in Colorado. Existing NYC and Denver areas also gain stores. The lifecycle, preference matching, API defaults, feed filters/menu, dashboard copy, and matched alert labels support the expanded areas. Coverage descriptions refer to selected premises.

Independent review found and resolved Denver-only defaults and an incorrect first-selected-area alert label. Regressions exercise actual preference matching, exact source geography, malformed or forged source identity, stock/format rejection, pagination limits, deduplication, immediate stop on denial, and partial-source retention. Historical state activation evidence remains intact.

Detailed evidence: [Florida ABC depth](engine-expansion-fl-abc-depth-20261022.md), [new retailers](engine-expansion-20261022-retail.md), and [existing retailer depth](../../engine/data/source-evidence/metro-depth-20261022/live-proof.json). Immutable production refresh and customer API results must be recorded separately after guarded release.
