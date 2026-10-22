# Pennsylvania FWGS expansion, 2026-10-22

Six reviewed FWGS pickup product signatures bind SKU, full source title, brand,
category (including the explicit null for 1792), type and exact official route.
They recover existing inventory without introducing fuzzy source aliases.

The immutable baseline is production refresh 39836962824, artifact 12451368306,
source commit cba1510deed1c87795a90c93c0e6eac02dfe0f5e. Its PA report SHA256 is
b5eab6207477e09644336606af3ee2b2e9d047af3a488ec7229115bc02adb773.
Original browser observation: 2026-10-22T17:03:05.073Z; state finished
2026-10-22T17:58:10.949Z. Replaying it is identity evidence, not fresh stock proof.
Small captured excerpts and provenance live in the two Pennsylvania FWGS test
fixture directories. The complete report remains in local operator evidence.

The capture contains 1362 reviewed positive pickup rows across 404 stores.
Existing public tier rules admit 912 of those rows across 387 stores:
Booker's 362, Elijah Craig Barrel Proof 317, Henry McKenna 10 Year 126, and 1792 BIB 107.
Larceny Barrel Proof 332 and Knob Creek 12 Year 118 remain standard-tier catalog
matches. Only 1792 BIB receives producer-designated limited status; neither source
matching nor producer designation establishes local rarity or a specific batch.
The three new canonical entries contain exact canonical aliases only; original
FWGS titles resolve through the source-scoped identity registry.

Per-store pickup quantity is independent of catalog/online inventory totals.
The collector requires the pickup endpoint, positive integral row quantity,
consumer retail premises and the original valid ISO browser timestamp.
Licensee Service Centers remain sample-only diagnostics. Missing/incomplete
artifacts fail closed and do not revive direct search.

Retired routes: 37 legacy direct search-term requests and two exact configured
FWGS search/FAQ routes. Original 403 evidence and timestamps remain recorded with
zero new attempts. The unrelated PLCB route remains unchanged.

Acceptance uses actual collector -> canonical JSON -> public drop -> reported
and current alert paths, real candidate dedupe keys and the exporter cap. It
requires exact accepted provenance, source timestamps within two hours, at least
800 reviewed public rows at 250 stores, all six canonical identities, all four
public-eligible families, and valid bounded published alert candidates. The CLI
writes diagnostics before failing; the production workflow always archives them.
A PA-only fresh browser collection and canonical production verification are
required before claiming live expansion. These checks establish source-backed
inventory and candidate eligibility, not physical stock or notification delivery.

The complete same-capture public replay rises from 3155 to 3388 rows: 233 net new
identities (Henry McKenna 126 and 1792 BIB 107), zero lost, zero unexpected.
Booker's and Elijah Craig already projected downstream before this pass. The new
source matching recovers 1362 identities at collection, not 1362 new public rows.
Reported/current alert builders, real dedupe and the actual cap produce 1000
published candidates both before and after; after includes 537 reviewed candidates
and all 912 reviewed public rows remain eligible for current-inventory candidates.
Full replay evidence remains in .operator/evidence/pa-composed-replay.json.
