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
const explorer = read("src/components/coverage/CoverageExplorer.tsx");
const map = read("src/components/coverage/CoverageMap.tsx");
const panel = read("src/components/coverage/CoverageStatePanel.tsx");
const search = read("src/components/coverage/CoverageSearch.tsx");
const styles = read("src/components/coverage/coverage.module.css");
const api = read("src/app/api/coverage/route.ts");
const navigation = read("src/components/Navigation.tsx");
const mapRedirect = read("src/app/map/page.tsx");
const sitemap = read("src/app/sitemap.ts");
const middleware = read("src/middleware.ts");

assert.match(page, /readCurrentCoverageContract/, "the page reads the one server-side coverage truth");
assert.match(page, /searchParams/, "server rendering honors URL state selection");
assert.match(page, /CoverageExplorer/, "the public page renders the explorer");
assert.match(page, /robots:[\s\S]*index:\s*true/, "coverage is a public acquisition surface");

assert.match(map, /<svg/, "the map is an inline local SVG");
assert.match(map, /role="button"/, "each SVG state behaves as a control");
assert.match(map, /tabIndex=\{0\}/, "SVG states are keyboard reachable");
assert.match(map, /event\.key === "Enter"[\s\S]*event\.key === " "/, "Enter and Space activate SVG states");
assert.match(map, /aria-label=/, "every state control has an accessible label");
assert.match(map, /states-10m\.json|states-albers-10m\.json/, "the visual uses real U.S. state geography rather than a tile grid");
assert.match(map, /topojson-client/, "the local Census-derived topology is converted to state features");
assert.doesNotMatch(map, /tilePath|TILE_WIDTH|COVERAGE_MAP_CELLS/, "the public visual is a state-line map, not a cartogram");
assert.doesNotMatch(map + explorer + styles, /mapbox|googleapis|google maps|leaflet|arcgis/i, "no external map service is used");

assert.match(explorer, /router\.replace/, "state selection updates the URL without a full navigation");
assert.match(explorer, /coverage_page_viewed/, "coverage page reach uses the privacy-safe event contract");
assert.match(explorer, /coverage_state_selected/, "state selection uses the privacy-safe event contract");
assert.match(explorer, /Browse all states/, "a complete text/list fallback accompanies the SVG");
assert.match(explorer, /capabilityLabel/, "list fallback includes the same coverage text as the map");
assert.match(explorer, /<h1>Check coverage <em>near you\.<\/em><\/h1>/, "the hero leads with the member question");
assert.match(explorer, /Coverage legend/, "the explorer includes a text-labeled legend");
assert.match(explorer, /<select/, "mobile users get a direct state selector");
assert.ok(explorer.indexOf("<CoverageMap") < explorer.indexOf("<CoverageStatePanel"), "the map remains the front-facing feature on every layout");
assert.match(explorer, /<CoverageStatePanel key=\{selectedState\.code\}/, "state changes remount local request state before draft restoration");

assert.match(panel, /How coverage works/, "technical coverage detail uses progressive disclosure");
assert.match(panel, /What we cannot yet see/, "state drilldown states its limits");
assert.match(panel, /data-health=\{state\.health\}/, "health is separate from capability");
assert.match(panel, /Known stores[\s\S]*Monitored stores[\s\S]*Inventory monitoring[\s\S]*Alert-ready/, "technical layers use customer-friendly labels");
assert.ok(panel.indexOf("<CoverageSearch") < panel.indexOf("How coverage works"), "local search appears before technical detail");
assert.match(panel, /visible=\{requestOpen\}/, "the full request form stays hidden until a state or search result asks for it");
assert.match(panel, /coverage-request-heading[\s\S]*\.focus\(\)/, "revealed request UI receives keyboard focus");
assert.doesNotMatch(panel + search, /quantity|bottle signal|bottleName|signalCount/i, "public explorer does not expose gated bottle data");

assert.match(search, /Search a city or store in this state/, "city/store search is clearly labeled");
assert.match(search, /REQUESTABLE_STATUSES/, "request actions are driven by missing or partial search results");
assert.match(search, /Request coverage/, "requestable search results expose an explicit action");
assert.doesNotMatch(search, /requestFailedSearch|Request this city or store/, "technical search failures cannot create synthetic request targets");
assert.match(search, /AbortController/, "state changes cancel in-flight location searches");
const searchResetEffect = search.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[stateCode\]\);/)?.[1] || "";
assert.doesNotMatch(searchResetEffect, /onTargetSelected/, "search initialization cannot close a restored sign-in draft");
assert.match(search, /requestState[\s\S]*stateCode/, "late responses cannot populate results for the previous state");
for (const status of ["covered", "partially-covered", "known-not-active", "actively-monitored", "known-expansion-candidate", "not-found"]) {
  assert.match(search, new RegExp(status), `search renders the ${status} status`);
}
assert.doesNotMatch(search, /track\([^)]*query|analytics[^;]*query/i, "raw location searches are not sent to analytics");

assert.match(styles, /@media\s*\(max-width:\s*700px\)/, "the explorer has a mobile layout");
assert.match(styles, /:focus-visible/, "interactive controls have visible focus treatment");
assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "motion respects user preference");

assert.match(api, /searchCurrentCoverageTargets/, "public search resolves through the shared server contract");
assert.match(api, /Cache-Control/, "public coverage reads have an explicit cache policy");
assert.match(navigation, /label:\s*"Coverage",\s*href:\s*"\/coverage"/, "Coverage is in primary navigation");
assert.match(mapRedirect, /redirect\("\/coverage"\)/, "legacy /map traffic redirects to /coverage");
assert.doesNotMatch(middleware, /"\/map\(\.\*\)"/, "legacy /map traffic reaches the public redirect instead of the sign-in wall");
assert.match(sitemap, /`\$\{origin\}\/coverage`/, "the public coverage explorer is discoverable in the sitemap");

console.log("coverage public surface tests passed");
