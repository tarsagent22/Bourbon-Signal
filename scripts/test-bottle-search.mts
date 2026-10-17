import assert from "node:assert/strict";
import inventory from "../src/data/bourbonBibleInventory.json" with { type: "json" };
import bottleSearchModule from "../src/lib/bottle-search.ts";
import bourbonBibleModule from "../src/lib/bourbonBible.ts";
import discoveryBottles from '../shared/library-discovery-bottles.json' with { type: 'json' };
import expressionBottles from '../shared/library-expression-bottles.json' with { type: 'json' };

const { rankBottleSearch } = bottleSearchModule;
const { getStaticBourbonBible } = bourbonBibleModule;
const catalog = [
  ...inventory,
  { id: "russells-reserve-10", canonicalName: "Russell's Reserve 10 Year", brand: "Russell's Reserve", producer: "Wild Turkey", aliases: ["russells 10", "russell reserve 10"], proof: 90, ageStatement: "10 Year" },
  { id: "russells-reserve-single-barrel", canonicalName: "Russell's Reserve Single Barrel", brand: "Russell's Reserve", producer: "Wild Turkey", aliases: ["russells single barrel", "rr sib"], proof: 110, ageStatement: null },
];

const expectations = [
  ["eh taylor", /Taylor/i],
  ["e h taylor", /Taylor/i],
  ["colonel taylor", /Taylor/i],
  ["eht", /Taylor/i],
  ["michters", /Michter/i],
  ["russel reserve", /Russell.*Reserve/i],
  ["woodford double oak", /Woodford Reserve Double Oaked/i],
] as const;

for (const [query, expected] of expectations) {
  const results = rankBottleSearch(catalog, query, 12);
  assert.ok(results.length > 0 && results.length <= 12, `${query} returns a bounded result set`);
  assert.match(results[0]!.canonicalName, expected, `${query} ranks the correct family or expression first`);
}

for (const query of ["eh taylor", "e h taylor", "colonel taylor", "eht"]) {
  const results = rankBottleSearch(catalog, query, 12);
  assert.ok(results.filter((bottle) => /Taylor/i.test(bottle.canonicalName)).length >= 4, `${query} surfaces E.H. Taylor family variants`);
  assert.ok(results.every((bottle) => /Taylor/i.test([bottle.canonicalName, bottle.brand, bottle.producer, ...(bottle.aliases || [])].join(" "))), `${query} bounds unrelated results`);
}

assert.match(rankBottleSearch(catalog, "reserve russel", 8)[0]!.canonicalName, /Russell.*Reserve/i, "tokens can arrive out of order");
assert.match(rankBottleSearch(catalog, "russel reserve", 8)[0]!.canonicalName, /Russell.*Reserve/i, "one bounded typo is tolerated");
assert.deepEqual(rankBottleSearch(catalog, "zzzz completely unrelated", 8), [], "unrelated text does not leak broad matches");

const fullCatalog = await getStaticBourbonBible();
for (const added of expressionBottles) {
  const entry = fullCatalog.find(bottle => bottle.id === added.id);
  assert.ok(entry, `${added.name}: producer-verified expression exists in online search`);
  assert.equal(entry.canonicalName, added.name);
  assert.equal(entry.rarityPending, true);
  assert.equal(entry.buyerVerdict, 'unknown');
  assert.equal(entry.isAlertEligible, false);
  assert.equal(entry.proof ?? null, null);
  assert.equal(entry.msrp ?? null, null);
  for (const query of [added.name, ...('aliases' in added ? added.aliases || [] : [])])
    assert.equal(rankBottleSearch(fullCatalog, query, 1)[0]?.id, added.id, query);
}
for (const added of discoveryBottles) {
  const entry = fullCatalog.find(bottle => bottle.id === added.id);
  assert.ok(entry, `${added.name}: server search retains the exact edition`);
  assert.equal(entry.canonicalName, added.name);
  assert.equal(entry.rarityPending, true);
  assert.equal(entry.buyerVerdict, 'unknown');
  assert.equal(entry.isAlertEligible, false);
  assert.ok(entry.photo, `${added.name}: matching artwork is available from the same catalog`);
}
for (const [id, proof] of [["wild-turkey-101-rye", 101], ["wild-turkey-rare-breed-rye", 112.2], ["new-riff-bottled-in-bond-rye", 100], ["green-river-rye", 95]] as const) {
  const entry = fullCatalog.find(bottle => bottle.id === id);
  assert.ok(entry, `${id} is available from the authoritative server catalog`);
  assert.equal(entry.category, "rye");
  assert.equal(entry.proof, proof);
  assert.equal(entry.rarityPending, true);
  assert.equal(entry.buyerVerdict, "unknown");
  assert.equal(entry.msrp ?? null, null);
}

for (const [query, expected] of expectations) {
  const results = rankBottleSearch(fullCatalog, query, 12);
  assert.match(results[0]!.canonicalName, expected, `${query} works against the complete server catalog`);
}
assert.ok(rankBottleSearch(fullCatalog, "eht", 12).filter((bottle) => /Taylor/i.test(bottle.canonicalName)).length >= 4, "the complete catalog returns E.H. Taylor family variants");

console.log("bottle search tests passed");
