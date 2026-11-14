# Town Crier Louisiana research candidate

Status: isolated research-only candidate. This source is not part of production collection, lifecycle activation, customer availability, or alert delivery.

## First-party route and scope

The retailer's public product client bundle calls `GET /api/products/{upc}?location={store_num}`. Its `getProduct(upc, location = "1")` method forwards the selected store number as the `location` query parameter. The website's public `GET /api/locations` returns the eight active premises and the collector requires the current ID/name/address set to match the captured cohort exactly before it requests products.

The closed research matrix checks two exact UPCs at those eight premises, after one locations request. The returned object contains `id`, `upc`, `name`, `category`, `price`, `quantity`, and `is_active`, but does not echo the requested location or provide an inventory-update timestamp. The collector therefore binds store identity to the exact query plus the verified location registry and records observation time as retrieval time only.

The source client renders `In Stock` when its quantity is positive. Town Crier's page warns that online inventory is updated periodically and may not reflect current shelf stock, and asks customers to call ahead. This source means **store-scoped website stock**, not verified physical shelf count or a reservation. Positive rows are binary and research-only; source quantities are retained in the raw capture and `siteReportedQuantity`, while emitted signal `quantity` remains zero and `quantityIsExact` false. A website quantity of zero is retained as a site observation and never emitted as a physical-stock negative.

## UPC identity and captured observations

- `088004021344`: `EAGLE RARE SINGLE BARREL 750ML`; the API description says the Eagle Rare bourbon is aged no less than ten years and 90 proof, binding it to the Bourbon Bible's `Eagle Rare 10 Year` identity.
- `088004005498`: `EH TAYLOR JR SMALL BATCH 750ML`; exact source name and UPC bind it to `E.H. Taylor Small Batch`.

On 2026-11-14, 16 one-shot product requests returned HTTP 200 with exact UPCs and active products. Eagle Rare was positive at 7 of 8 stores; E.H. Taylor was positive at all 8. Store #2 Slidell returned website quantity zero for Eagle Rare. The retailer API did not echo location ID; each request used the first-party client query contract.

The retained response bodies and digest manifest are in [the replay fixture directory](../../engine/test/fixtures/town-crier-la/). These are for offline replay only; they do not establish later inventory freshness.

## Running isolated research

From `engine`, `npm run shadow:town-crier-la` explicitly runs the standalone LA research adapter and writes a report under `out/shadow/LA/town-crier-{run-id}/`; it does not replace or extend the existing AK/LA grocery state report. The command sets shadow mode, disables delivery, and emits the ordinary isolated shadow `report.json` and `evidence.json`. A normal LA or AK shadow run does not select Town Crier. The incident file is `out/research-source-attempts/town-crier-la-incidents.json`; the existing state-expansion workflow caches the `out/research-source-attempts` parent directory. A future dedicated scheduled job must restore and save that same journal even when collection fails. A persistent host denial or unresolved request journal blocks later calls; the collector makes one request per planned endpoint and stops immediately on denial or any profile mismatch.

Focused fixture replay: `npm run bible && node --test test/town-crier-la-research.test.mjs`. The test covers location binding, matching UPC/name, exact current premises, zero quantities without physical negatives, response-time/caveat semantics, and durable denial stop behavior. No current retailer request is made by this test.
