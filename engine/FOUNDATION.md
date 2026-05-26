# Bourbon Signal Engine Foundation Notes

This is a standalone foundation and is not wired into the live site.

## What exists

- State source registry: `src/state-sources.mjs`
- Canonical bottle bible seed: `data/bourbon-bible-seed.json`
- Bible builder: `src/build-bible.mjs`
- Generic collector: `src/collectors/generic-state.mjs`
- Location precision probes: `src/collectors/precision-probes.mjs`
- Location precision model/report: `src/location-precision.mjs`, `src/location-report.mjs`
- Operational persistence/diffing/alert-candidate layer: `src/confidence-policy.mjs`, `src/operational-report.mjs`
- Website-facing export contract: `src/export-site-contract.mjs` (`npm run export:site`) writes integration-safe JSON under `out/site/` without wiring the live app.
- Quality gates: `src/repeatability-check.mjs` (`npm run repeatability`), `src/quality-audit.mjs` (`npm run quality`), and `npm run verify:pristine` for export + repeatability + audit + tests.
- OHLQ browser-assisted collector: `src/ohlq-browser-collector.mjs` (`npm run ohlq` for seeded products, `npm run ohlq:discover` for listing-page product expansion) writes `out/browser/ohlq-availability.json` before the normal engine run consumes it.
- Shared browser/CDP extraction layer: `src/core/browser-session.mjs` and `src/browser-source-discovery.mjs` (`npm run browser:discover`) reuse the OpenClaw-managed Chrome CDP session, render blocked/JS-heavy state sites, collect page text/product links/network resource candidates, perform common age-gate acceptance, and write per-state artifacts under `out/browser/*-browser-discovery.json` plus `out/browser/browser-discovery-summary.json`.
- Oregon browser-assisted collector: `src/or-browser-collector.mjs` (`npm run or`) drives Oregon Liquor Search through the browser/session flow, accepts the age gate, searches tracked rare terms from a ZIP, drills product codes, and writes store-level quantity rows to `out/browser/OR-product-availability.json` for the normal precision probe to consume.
- Fetching/text utilities: `src/core/*`
- Fallback official-source hints for WAF-blocked sites: `src/fallback-hints.mjs`
- Runner: `src/run.mjs`
- Verification gate: `src/verify.mjs`

## States covered

OH, OR, IA, UT, AL, VA, PA, ID, NC, NH, Montgomery County MD, ME, VT, MI, MT, WV, WY, MS.

## Data model direction

The engine emits normalized `signals` rather than pretending every state has the same inventory model.

Signal families:

- `catalog_row` — structured row from public product/data portal.
- `bottle_inventory_signal` — source text indicates inventory/store availability and bottle matches.
- `allocated_release_signal` — limited/allocated/release source with bottle matches.
- `release_document_signal` / `document_signal` — PDFs or docs that should be parsed more deeply later.
- `official_search_index_signal` — official page was WAF-blocked to server fetch, but public search index confirms a useful official source and route.
- `policy_signal` / `warehouse_policy_signal` — state policy/context that determines how alerts should be presented.
- `store_inventory_result` / `store_inventory_out_of_stock` — store-level rows from public inventory APIs or county/store search surfaces.
- `browser_captured_store_inventory_sample` — store-level rows proven through browser/CDP discovery for a WAF/session-gated source. These are evidence and parser scaffolding, not yet automated live inventory alerts.
- `browser_rendered_inventory_surface_signal`, `browser_rendered_product_link`, and `browser_api_endpoint_discovery` — common browser-discovery contract for rendered pages/product links/API candidates when raw server fetch is blocked or too shallow.

Location precision fields now ride on signals when available:

- `locationPrecision` — e.g. `store_level`, `board_county`, `board_warehouse`, `store_aggregate`, `statewide_catalog`, `statewide_policy`.
- `locationName`, `storeName`, `storeAddress`, `city`, `county`, `quantity`, `warehouseQty` — populated only when the source exposes them.
- `out/location-hardening.md` / `.json` — compares the target public precision for each state against what the engine currently extracts.

Operational outputs now turn snapshots into user-facing candidates:

- `out/current-snapshot.json` — normalized operational view of all current signals.
- `out/history/snapshots/*.json` — persisted run snapshots for future comparisons.
- `out/diff.json` / `.md` — new/changed/missing signal comparisons against the previous snapshot.
- `out/alert-candidates.json` / `.md` — ranked inventory/watch candidates, with state policy and confidence semantics attached.
- `out/confidence-policy.json` — state-by-state rules for how to interpret signals without overclaiming live inventory.

Website-facing contract outputs live under `out/site/` and are the only files the Next.js app should consume when integration begins:

- `manifest.json` — contract version (`bourbon-signal-site-v0.1`) and schema/file map.
- `stats.json` — totals plus precision/rare coverage and integration caveat.
- `bottles.json` — canonical Bourbon Bible-matched bottles only; noisy unmatched product links are intentionally excluded.
- `stores.json` — extracted store-level locations.
- `drops.json` — normalized inventory/watch/drop rows for test-mode UI.
- `alerts.json` — ranked candidate alerts; not user-sent until alert policy is explicitly enabled.

Implemented precision probes:

- Ohio OHLQ browser/CDP collector → `npm run ohlq` loads seeded OHLQ product pages, reads `document.documentElement.dataset.csrfToken`, calls `/api/product-availability/{sku}?isExclusive=false&sortByAvailability=true&sku={sku}`, and writes store-level agency rows to `out/browser/ohlq-availability.json`. `npm run ohlq:discover` first scans rendered OHLQ bourbon listing pages and writes discovered product URLs to `data/browser-discovery/ohlq-bourbon-discovered-products.json`, then collects those products in the same browser session. The normal precision probe consumes rows whose `VariantCode` matches the selected SKU and decodes OHLQ's hashed `I` bucket into `Not Available`, `Sold Out`, `Limited Supply`, or `In Stock`. Direct Node/server fetch is still Cloudflare-gated. Discovery artifact: `data/browser-discovery/ohlq-product-availability-discovery.json`; tracked product seed file: `data/ohlq-products.json`.
- Oregon Liquor Search browser/session collector → `npm run or` searches tracked rare/favorite terms through the rendered site, follows the age-gated product-code drilldown, parses product rows and store rows, excludes non-bourbon false positives, and writes `out/browser/OR-product-availability.json`. The OR precision probe emits store-level `store_inventory_result` rows with daily-updated quantity caveat. Current default search ZIP is `97205`, controlled by `OR_SEARCH_ZIP`; terms are controlled by `OR_SEARCH_TERMS`.
- Iowa ABD 14-day snapshot CSV → store-level Class E/licensee delivery rows with address and delivered bottle count.
- Utah DABS Product Locator DataTables API → statewide store/warehouse/on-order quantity aggregates by SKU.
- Wake County ABC inventory form → county-board store-level search results and out-of-stock/current inventory blocks.
- Virginia ABC `storeNearby` inventory API → store-level rows with quantity, address, city, coordinates, and store id for tracked product codes. Current probe covers Blanton's Single Barrel (`021460`) with limited-availability caveat and 1792 Small Batch (`021236`) as a normal-product inventory signal.
- Pennsylvania FWGS Oracle Commerce search hydration → statewide store/shipping aggregate result counts for rare tracked terms; store-specific pickup inventory still needs Oracle Commerce store/fulfillment API extraction.
- Montgomery County ABS autocomplete API plus ASP.NET search postback → county-board product matches with item codes, prices, and allocated/HAL flags; allocated rows do not expose store inventory modal arguments in the product-card HTML.
- Browser discovery artifacts currently add rendered/API/product-link intelligence for OR, PA, NH, Montgomery County ABS, and Maine Spirits. PA and Maine now produce useful rendered product/search/lottery signals; NH still renders Cloudflare interstitials in the OpenClaw browser session and remains blocked pending a deeper/longer challenge-solving session or another official data route.

## Important implementation principle

Do not force a fake nationwide “in stock” field. Different states produce different signal confidence:

- Iowa can produce strong structured catalog/product rows from a public data portal.
- Alabama is stronger as a release calendar/allocated-list watcher than live inventory.
- Virginia normal-product API rows can be presented as store-level inventory candidates when quantity is positive. Virginia limited-availability rows should be treated as watch/caveated signals unless policy/window validation is added, because official policy says those items do not show online before release.
- Ohio OHLQ store-level availability is now browser-assisted and bucket-decoded. Only positive `Limited Supply` / `In Stock` rows are emitted as inventory alert candidates; `Sold Out` / `Not Available` rows are retained only in raw browser output. Alerts must describe status, not quantity, because OHLQ does not expose explicit bottle counts.
- Oregon store-level rows are inventory-grade with a daily-update caveat. The source itself says quantities are not real time and should be verified by calling the store, so alerts should include that caveat.
- Mississippi is currently policy/warehouse context only until a public product/price/availability feed is found.

## Next hardening passes

1. Turn OHLQ discovery into a prioritized watchlist strategy: rare/allocated products first, user-favorite products second, broad listing crawl only as lower-priority catalog context.
2. Expand Virginia ABC product-code discovery beyond hand-seeded tracked products by extracting codes from rendered product pages/search results.
3. Add PDF text extraction for Vermont and Michigan price-book PDFs.
4. Expand Oregon beyond the Portland ZIP test seed into a real geography/user-favorites strategy, while preserving the daily-update caveat.
5. Continue state-specific precision parsers for Alabama event/store lists, PA FWGS store-specific pickup inventory, NHLC, Maine Spirits store-finder details, and Montgomery County ABS store inventory modal for non-allocated rows.
6. Improve persistence/diffing from signal-level comparisons into product-specific drop types: new product, quantity/status change, release added, lottery opened, price changed.
7. Refine confidence policy per state/source as real-world false positives/false negatives appear before alerting testers.

## Pristine/readiness expectations

- Root source should stay free of `tmp_*` and `chunk-*` scratch files. One-off reverse-engineering captures are preserved under `research/scratch/` and ignored by git.
- Generated outputs are under `out/` and ignored by git.
- Run `npm run verify:pristine` before site integration. It exports the site contract, runs operational repeatability twice, re-exports the contract after the stable snapshot, audits quality invariants, and runs `npm test`.
