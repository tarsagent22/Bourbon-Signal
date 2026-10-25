# Arizona expansion, October 24, 2026

Expand the existing Safeway/Albertsons integration from 32 to 80 selected grocery premises. Protect all 32 previously released premises before allocating additions across cities. Each selected premise still requires a fresh resolver address and store-specific positive inventory; discovery never creates inventory.

The bounded request plan allows 80 bourbon searches and 16 rotating rare searches, with a hard ceiling of 96. Requests remain sequential at the existing 900 ms minimum default pause. Smaller store overrides remain supported. Every store receives all rare query families across its own visits. A first 401, 403 or 429 stops further requests to that host. CityHive and Flagstaff denial persistence stays intact.

The Arizona source runtime receives one bounded ten-minute attempt to accommodate the larger sequential collection. Both state selection and the nested precision source cap normal adaptive cadence at 30 minutes so unchanged inventory does not disappear behind prolonged efficiency backoff. Explicit source cooldowns still take precedence; collection scheduling is subject to the production refresh workflow actually running.

## Fresh live preflight

The existing 18-ZIP resolver returned 116 exact Arizona premises in 41 cities. Inventory collection from 00:15:28 to 00:18:35 UTC on October 25 returned HTTP 200 for all 96 inventory searches, with no roadblocks. This is October 24 local time in Arizona and Eastern time.

The normal collector, canonical serialization, public eligibility and alert pipeline produced 309 source rows across 78 grocery stores and 186 eligible public rows across 77 grocery stores in 39 cities. Of those, 45 stores and 106 public rows are beyond the previously released 32-store grocery cohort. The previous total of 34 listed premises also included two independent stores; these are preserved by the full Arizona collector and are excluded from the new-store claim.

New city proof includes Sedona, Cottonwood and Benson. Reduced original product captures are checked in as regression fixtures. Full raw captures remain in the local evidence archive; their SHA-256 hashes and the strict verifier output are recorded in `engine/data/source-evidence/arizona-expansion-20261024/preflight.json`.

## Publication acceptance

The targeted Arizona verifier now requires 80 selected premises, preservation of the former 32-store cohort, at least 48 genuinely new selected premises and fresh public inventory at at least 32 genuinely new stores. It also requires at least 64 positive grocery stores and 82 distinct public inventory rows. Original product, premises, timestamps, quantity semantics, denied-host stops, the request budget and alert provenance remain enforced.

Preflight results prove reachable inventory and export correctness. Production acceptance additionally requires a guarded merge, a targeted `states=AZ` refresh on merged current main, immutable artifact verification and canonical customer API confirmation. No claim of production expansion follows from this document alone.
