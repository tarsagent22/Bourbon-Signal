import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deliveryModule = await import("../src/lib/alert-delivery.ts");
const delivery = deliveryModule.default || deliveryModule;

const areaPrefs = (ncBoards: string[]) => ({
  states: ["NC"],
  ncBoards,
  gaAreas: [],
  tnAreas: [],
  vaCities: [],
  ohCities: [],
  iaCities: [],
  idCities: [],
  scAreas: [],
  caAreas: [],
  nvAreas: [],
  nyAreas: [],
  coAreas: [],
  paCounties: [],
  paStores: [],
});

const payload = JSON.parse(readFileSync(new URL("../engine/out/site/alerts.json", import.meta.url), "utf8"));
const greensboroCandidates = (payload.alerts || []).filter((candidate: Record<string, unknown>) =>
  String(candidate.state || "").toUpperCase() === "NC"
  && candidate.city === "Greensboro"
  && !candidate.storeCity
  && !candidate.store_city,
);
assert.ok(greensboroCandidates.length > 0, "checked-in alerts must exercise raw city-only NC candidates");
for (const candidate of greensboroCandidates) {
  assert.equal(
    delivery.candidateMatchesArea(candidate, areaPrefs(["Greensboro ABC"])),
    true,
    `Greensboro candidate ${String(candidate.id)} must match its board preference through the raw city fallback`,
  );
  assert.equal(
    delivery.candidateMatchesArea(candidate, areaPrefs(["Dunn ABC"])),
    false,
    `Greensboro candidate ${String(candidate.id)} must not cross-match another board`,
  );
}

assert.equal(
  delivery.candidateMatchesArea({
    state: "NC",
    locationName: "Hertford ABC Board",
    county: "Hertford County",
  }, areaPrefs(["Hertford ABC"])),
  true,
  "the authoritative Hertford municipal label must survive a conflicting county fallback",
);
assert.equal(
  delivery.candidateMatchesArea({
    state: "NC",
    locationName: "Hertford ABC Board",
    county: "Hertford County",
  }, areaPrefs(["Hertford County ABC"])),
  false,
  "the Hertford municipal signal must not leak into Hertford County alerts",
);
assert.equal(
  delivery.candidateMatchesArea({
    state: "NC",
    locationName: "Hertford County ABC Board",
    county: "Hertford",
  }, areaPrefs(["Hertford County ABC"])),
  true,
  "the Hertford County board must remain independently matchable",
);

console.log(`NC alert area matching verified across ${greensboroCandidates.length} raw-city candidates and Hertford ambiguity fixtures.`);
