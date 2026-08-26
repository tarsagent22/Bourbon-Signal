import assert from "node:assert/strict";
import inventory from "../src/data/bourbonBibleInventory.json" with { type: "json" };
import bottleSearchModule from "../src/lib/bottle-search.ts";
import bourbonBibleModule from "../src/lib/bourbonBible.ts";

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
for (const [query, expected] of expectations) {
  const results = rankBottleSearch(fullCatalog, query, 12);
  assert.match(results[0]!.canonicalName, expected, `${query} works against the complete server catalog`);
}
assert.ok(rankBottleSearch(fullCatalog, "eht", 12).filter((bottle) => /Taylor/i.test(bottle.canonicalName)).length >= 4, "the complete catalog returns E.H. Taylor family variants");

console.log("bottle search tests passed");
