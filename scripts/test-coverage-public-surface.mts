import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import { US_STATE_OPTIONS } from "../src/lib/coverage-model.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const topology = JSON.parse(readFileSync(new URL("../node_modules/us-atlas/states-10m.json", import.meta.url), "utf8"));
const mappedNames = new Set(
  (feature(topology, topology.objects.states) as { features: Array<{ properties?: { name?: string } }> })
    .features.map((entry) => entry.properties?.name).filter(Boolean),
);
assert.equal(US_STATE_OPTIONS.length, 51);
assert.deepEqual(
  US_STATE_OPTIONS.filter((state) => !mappedNames.has(state.name)),
  [],
  "the actual topology used by the explorer includes all 50 states and DC",
);

const page = read("src/app/coverage/page.tsx");
const coverageLoading = read("src/app/coverage/loading.tsx");
const coverageError = read("src/app/coverage/error.tsx");
const explorer = read("src/components/coverage/CoverageExplorer.tsx");
const map = read("src/components/coverage/CoverageMap.tsx");
const panel = read("src/components/coverage/CoverageStatePanel.tsx");
const summary = read("src/components/coverage/CoverageSummary.tsx");
const search = read("src/components/coverage/CoverageSearch.tsx");
const requestForm = read("src/components/coverage/CoverageRequestForm.tsx");
const styles = read("src/components/coverage/coverage.module.css");
const model = read("src/lib/coverage-model.ts");
const welcome = read("src/app/welcome/page.tsx");
const api = read("src/app/api/coverage/route.ts");
const navigation = read("src/components/Navigation.tsx");
const mapRedirect = read("src/app/map/page.tsx");
const sitemap = read("src/app/sitemap.ts");
const middleware = read("src/middleware.ts");

assert.match(page, /readCurrentCoverageContract/, "the page reads the one server-side coverage truth");
assert.match(page, /searchParams/, "server rendering honors URL state selection");
assert.match(page, /CoverageExplorer/, "the public page renders the explorer");
assert.match(page, /robots:[\s\S]*index:\s*true/, "coverage is a public acquisition surface");
assert.match(page, /what Bourbon Signal can show/i, "coverage metadata uses customer language");
assert.match(coverageLoading, /Loading available information/, "loading copy uses customer language");
assert.match(coverageError, /We could not load this area/, "error copy uses customer language");
assert.doesNotMatch(page + coverageLoading + coverageError, /monitoring capability|source map|source capability|source truth/i, "coverage route states do not expose internal language");

assert.match(map, /<svg/, "the map is an inline local SVG");
assert.match(map, /role=\{interactive \? "button" : undefined\}/, "interactive map states behave as controls");
assert.match(map, /data-interactive=\{interactive\}/, "the map exposes its interaction mode to styling");
assert.match(styles, /\.mapFrame\[data-interactive="false"\] \.stateCell[\s\S]{0,80}cursor:\s*default/, "display maps do not imply clickable states");
assert.match(styles, /\.mapFrame\[data-interactive="true"\] \.stateCell:hover/, "hover affordance is limited to the interactive explorer");
assert.match(map, /tabIndex=\{interactive \? 0 : undefined\}/, "only interactive map states are keyboard reachable");
assert.match(map, /event\.key === "Enter"[\s\S]*event\.key === " "/, "Enter and Space activate SVG states");
assert.match(map, /aria-label=/, "every state control has an accessible label");
assert.match(map, /data-coverage-strength/, "map fill color derives from the public strength tier, not binary availability");
assert.match(map, /Verified coverage breadth/, "the map labels strength as historical source breadth rather than freshness");
assert.doesNotMatch(map, /healthLabel|update status/i, "the map itself stays focused on coverage strength");
assert.match(map, /states-10m\.json|states-albers-10m\.json/, "the visual uses real U.S. state geography rather than a tile grid");
assert.match(map, /topojson-client/, "the local Census-derived topology is converted to state features");
assert.doesNotMatch(map, /tilePath|TILE_WIDTH|COVERAGE_MAP_CELLS/, "the public visual is a state-line map, not a cartogram");
assert.doesNotMatch(map + explorer + styles, /mapbox|googleapis|google maps|leaflet|arcgis/i, "no external map service is used");

assert.match(explorer, /router\.replace/, "state selection updates the URL without a full navigation");
assert.match(explorer, /COVERAGE_REQUEST_DRAFT_KEY[\s\S]*sessionStorage\.removeItem/, "changing map or selector state clears any draft tied to the previous state");
assert.match(explorer, /coverage_page_viewed/, "coverage page reach uses the privacy-safe event contract");
assert.match(explorer, /coverage_state_selected/, "state selection uses the privacy-safe event contract");
assert.match(explorer, /Browse all states/, "a complete text/list fallback accompanies the SVG");
assert.match(explorer, /coverageStrengthLabel/, "list fallback includes the same public strength tier as the map");
assert.doesNotMatch(explorer, /state\.healthLabel/, "the state list omits update-health copy");
assert.match(explorer, /<h1>Check coverage <em>near you\.<\/em><\/h1>/, "the hero leads with the member question");
assert.match(panel, /CoverageSummary/, "the selected-state panel uses the shared concise summary");
assert.match(summary, /coverageStrengthLabel/, "the shared summary leads with the same honest strength tier");
assert.doesNotMatch(explorer + panel + map, /Intelligence only|Deep coverage|Active coverage|Focused coverage/i, "coverage categories use direct customer-facing language");
assert.match(explorer, /<select/, "mobile users get a direct state selector");
assert.ok(explorer.indexOf("<CoverageMap") < explorer.indexOf("<CoverageStatePanel"), "the map remains the front-facing feature on every layout");
assert.match(explorer, /<CoverageStatePanel key=\{selectedState\.code\}/, "state changes remount local request state before draft restoration");
assert.doesNotMatch(explorer + panel + search + map + welcome, /Known boards|Searchable stores|Probeable stores|Catalog tracking|Inventory-monitored stores|Alert-ready|Store monitoring levels|Boards with shipment intelligence|Single-store shipment boards|store-equivalent shipment intelligence/i, "internal coverage vocabulary stays out of the customer-facing surfaces");
assert.match(panel, /What you can do here/, "the state panel explains customer outcomes directly");
assert.match(model, /Find \$\{scope\.searchableStores\}|Find listed stores/, "the model provides a plain store-directory explanation");
assert.match(model, /shipments and releases/i, "the model names shipment and release information directly");
assert.match(model, /current bottle availability/i, "the model names current availability directly");
assert.match(model, /restock alerts/i, "the model names restock alerts directly");
assert.match(model, /customerSummary|customerCanSee|customerCannotSee/, "plain customer copy is kept separate from the underlying coverage contract");
assert.match(panel, /customerCanSee \|\| state\.canSee/, "the panel renders the plain customer capabilities");
assert.doesNotMatch(search, /Results describe monitoring coverage/i, "search explains what the customer gets rather than exposing monitoring terminology");
assert.match(welcome, /CoverageSummary/, "Welcome uses the shared coverage summary");
assert.match(summary, /coverageMonitoringFootprint\(state\)/, "the shared summary shows stale-inclusive monitoring-library breadth for every state");
assert.doesNotMatch(summary, /Stores with current inventory signals|inventoryMonitoredStores|current signals/i, "the shared summary omits current freshness and inventory-health counts");

assert.match(panel, /How we check this area/, "coverage detail uses progressive disclosure");
assert.match(panel, /What is not available yet/, "state drilldown states its limits");
assert.doesNotMatch(panel, /data-health|Update status|healthCopy/, "the primary state panel omits update-health messaging");
assert.match(panel, /What you can do here/, "the state panel leads with plain customer outcomes");
assert.ok(panel.indexOf("<CoverageSearch") < panel.indexOf("How we check this area"), "local search appears before explanatory detail");
assert.match(panel, /visible=\{requestOpen\}/, "the generalized request form stays hidden until its single action is used");
assert.match(panel, /coverage-request-heading[\s\S]*\.focus\(\)/, "revealed request UI receives keyboard focus");
assert.equal((panel.match(/>\s*Request coverage\s*</g) || []).length, 1, "the state panel presents exactly one coverage-request action");
assert.doesNotMatch(panel, /Request better statewide coverage/, "statewide-only request language is removed");
assert.doesNotMatch(panel + search, /quantity|bottle signal|bottleName|signalCount/i, "public explorer does not expose gated bottle data");

assert.match(search, /Search a city or store in this state/, "city/store search is clearly labeled");
assert.doesNotMatch(search, /REQUESTABLE_STATUSES|onTargetSelected|Request coverage/, "search results describe coverage without duplicating request actions");
assert.doesNotMatch(search, /requestFailedSearch|Request this city or store/, "technical search failures cannot create synthetic request targets");
assert.match(search, /AbortController/, "state changes cancel in-flight location searches");
assert.match(search, /requestState[\s\S]*stateCode/, "late responses cannot populate results for the previous state");
for (const status of ["covered", "partially-covered", "known-not-active", "actively-monitored", "known-expansion-candidate", "not-found"]) {
  assert.match(search, new RegExp(status), `search renders the ${status} status`);
}
assert.doesNotMatch(search, /track\([^)]*query|analytics[^;]*query/i, "raw location searches are not sent to analytics");

assert.match(styles, /@media\s*\(max-width:\s*700px\)/, "the explorer has a mobile layout");
assert.match(styles, /:focus-visible/, "interactive controls have visible focus treatment");
assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "motion respects user preference");
assert.match(styles, /--coverage-strong:\s*#789f63/i, "strong coverage has a dedicated green color");
assert.match(styles, /--coverage-moderate:\s*#d8a84f/i, "moderate coverage has a distinct amber color");
assert.match(styles, /--coverage-sparse:\s*#ae7552/i, "sparse coverage has a distinct terracotta color");
assert.match(styles, /--coverage-none:\s*#312c28/i, "no coverage has a neutral color");

assert.match(requestForm, /<select[\s\S]*required[\s\S]*US_STATE_OPTIONS/, "the generalized form requires a valid state selection");
assert.match(requestForm, /<details[\s\S]*Add county, city, or store details[\s\S]*name="manualCity"/, "city is available as optional detail");
assert.match(requestForm, /<details[\s\S]*name="manualStoreName"/, "store is available as optional detail");
assert.doesNotMatch(requestForm, /targetChoices|coverage-target|Matched store/, "the generalized form does not ask users to choose among request modes");

assert.match(api, /searchCurrentCoverageTargets/, "public search resolves through the shared server contract");
assert.match(api, /Cache-Control/, "public coverage reads have an explicit cache policy");
assert.match(navigation, /label:\s*"Coverage",\s*href:\s*"\/coverage"/, "Coverage is in primary navigation");
assert.ok(navigation.indexOf('label: "Bottle Check"') < navigation.indexOf('label: "Coverage"'), "Coverage follows Bottle Check in primary navigation");
assert.match(mapRedirect, /redirect\("\/coverage"\)/, "legacy /map traffic redirects to /coverage");
assert.doesNotMatch(middleware, /"\/map\(\.\*\)"/, "legacy /map traffic reaches the public redirect instead of the sign-in wall");
assert.match(sitemap, /`\$\{origin\}\/coverage`/, "the public coverage explorer is discoverable in the sitemap");

console.log("coverage public surface tests passed");
