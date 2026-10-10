import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dropFeedSearchMatches, sightingFeedSearchMatches, feedSearchStateCodes } from "../src/lib/signals/feed-search.ts";
import { parseSignalFeedFilters } from "../src/lib/signals/signal-feed-filters.ts";
import { encodeSignalFeedCursor, decodeSignalFeedCursor } from "../src/lib/signals/signal-feed-cursor.ts";
import { createSignalFeedHandler } from "../src/lib/signals/signal-route.ts";
import { scopedDropFeedHistoryEnabled } from "../src/lib/drop-feed-history.ts";
import { paginateDrops } from "../src/lib/drop-cursor.ts";

const drop = { id: "wake", canonical_name: "Weller Antique 107", brand_name: "Weller", aliases: ["OWA"], state: "NC", store_name: "Cameron Village ABC", store_city: "Raleigh", store_county: "Wake", board_name: "Wake County ABC", store_address: "1 Main Street", timestamp: "2026-10-09T10:00:00Z" };
const sighting = { bottleName: "Weller Antique 107", storeName: "Cameron Village ABC", storeCity: "Raleigh", storeAddress: "1 Main Street", storeState: "NC", storeZip: "27601" };

test("one query matches bottles, brands, aliases, stores, cities, counties, boards and states", () => {
  for (const query of ["weller", "Antique", "owa", "Cameron Village", "raleigh", "wake", "Wake County ABC", "NC", "North Carolina", "  North   Carolina  "]) assert.ok(dropFeedSearchMatches(drop, query), query);
  for (const query of ["Weller", "Cameron Village", "Raleigh", "NC", "North Carolina", "27601"]) assert.ok(sightingFeedSearchMatches(sighting, query), query);
  assert.equal(dropFeedSearchMatches(drop, "Virginia"), false);
  assert.equal(dropFeedSearchMatches(drop, "Pappy"), false);
  assert.ok(dropFeedSearchMatches(drop, ""));
});

test("search is literal and state abbreviations do not expand to unrelated states", () => {
  assert.equal(dropFeedSearchMatches(drop, "%"), false);
  assert.equal(sightingFeedSearchMatches(sighting, "_"), false);
  assert.deepEqual(feedSearchStateCodes("NC"), ["NC"]);
  assert.deepEqual(feedSearchStateCodes("CA"), ["CA"]);
  assert.equal(dropFeedSearchMatches({ ...drop, state: "VA", canonical_name: "French Oak", brand_name: "French Oak" }, "NC"), false);
  assert.ok(dropFeedSearchMatches({ ...drop, board_name: "", store_name: "", store_city: "" }, "Wake County"));
  assert.ok(feedSearchStateCodes("North Carolina").includes("NC"));
  assert.ok(feedSearchStateCodes("Virginia").includes("WV"));
});

test("parser bounds search and preserves a separate bottle-only filter", () => {
  const filters = parseSignalFeedFilters(new URL("https://example.test?search=++Wake+++County++&bottle=Weller"));
  assert.equal(filters.search, "Wake County");
  assert.equal(filters.bottle, "Weller");
  assert.throws(() => parseSignalFeedFilters(new URL(`https://example.test?search=${"a".repeat(101)}`)), /search/);
  assert.throws(() => parseSignalFeedFilters(new URL("https://example.test?search=a%00b")), /search/);
  assert.equal(scopedDropFeedHistoryEnabled({ search: "Wake" }), true);
});

test("search survives cursors and changed searches reject an old cursor", async () => {
  const filters = parseSignalFeedFilters(new URL("https://example.test?search=Wake"));
  const cursor = encodeSignalFeedCursor({ view: "market", dropsOffset: 1, dropSnapshot: "search", memberBoundary: null, filters, asOf: "2026-10-09T12:00:00Z" });
  assert.deepEqual(decodeSignalFeedCursor(cursor)?.filters, filters);
  let calls = 0;
  const handler = createSignalFeedHandler({ getDrops: async () => { calls++; return Response.json({ drops: [] }); }, getSightings: async () => Response.json({ sightings: [] }) });
  const response = await handler(new Request(`https://example.test?view=market&search=Raleigh&cursor=${cursor}`));
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("search delegates to both full source queries alongside selected filters", async () => {
  const calls: URL[] = [];
  const handler = createSignalFeedHandler({
    getDrops: async request => { calls.push(new URL(request.url)); return Response.json({ drops: [], total: 0 }); },
    getSightings: async request => { calls.push(new URL(request.url)); return Response.json({ sightings: [], totalSightings: 0 }); },
  });
  const response = await handler(new Request("https://example.test?search=Wake&state=NC&tiers=allocated&freshness=7d"));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  for (const url of calls) {
    assert.equal(url.searchParams.get("search"), "Wake");
    assert.equal(url.searchParams.get("bottle"), null);
    assert.equal(url.searchParams.get("state"), "NC");
    assert.equal(url.searchParams.get("tiers"), "allocated");
    assert.ok(url.searchParams.get("since"));
  }
});

test("matching rows beyond an unfiltered first page remain searchable and paginate chronologically", async () => {
  const rows = [
    ...Array.from({ length: 90 }, (_, index) => ({ ...drop, id: `other-${index}`, store_city: "Charlotte", store_county: "Mecklenburg", board_name: "Mecklenburg ABC", timestamp: "2026-10-09T11:00:00Z" })),
    ...Array.from({ length: 4 }, (_, index) => ({ ...drop, id: `wake-${index}`, timestamp: `2026-10-09T0${9 - index}:00:00Z` })),
  ];
  const handler = createSignalFeedHandler({
    getDrops: async request => {
      const url = new URL(request.url);
      const matches = rows.filter(row => dropFeedSearchMatches(row, url.searchParams.get("search") || ""));
      const page = paginateDrops(matches, { limit: Number(url.searchParams.get("limit")), offset: Number(url.searchParams.get("offset") || 0), cursor: url.searchParams.get("cursor"), snapshot: "fixture" });
      return Response.json({ drops: page.items, total: matches.length, snapshot: "fixture", hasMore: page.hasMore });
    },
    getSightings: async () => Response.json({ sightings: [], totalSightings: 0 }),
  });
  const first = await (await handler(new Request("https://example.test?view=market&search=Wake&limit=2"))).json();
  assert.equal(first.signals.length, 2);
  assert.equal(first.sourceTotals.drops, 4);
  assert.ok(first.hasMore);
  const second = await (await handler(new Request(`https://example.test?view=market&search=Wake&limit=2&cursor=${first.nextCursor}`))).json();
  assert.equal(second.signals.length, 2);
  assert.equal(second.hasMore, false);
  const signals = [...first.signals, ...second.signals];
  assert.equal(new Set(signals.map(signal => signal.id)).size, 4);
  assert.deepEqual(signals.map(signal => signal.timing.displayAt), [...signals.map(signal => signal.timing.displayAt)].sort().reverse());
});

test("membership denial prevents both search source reads", async () => {
  let calls = 0;
  const handler = createSignalFeedHandler({ getFilterAccess: async () => ({ canUseBottleSearch: false, canUseDropFeedFilters: false, canUseAdvancedFilters: false }), getDrops: async () => { calls++; return Response.json({ drops: [] }); }, getSightings: async () => { calls++; return Response.json({ sightings: [] }); } });
  const response = await handler(new Request("https://example.test?search=Raleigh"));
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test("real source routes apply search before pagination and database limits", () => {
  const drops = readFileSync("src/app/api/drops/route.ts", "utf8");
  assert.ok(drops.indexOf("if (search) drops = drops.filter") < drops.indexOf("const page = paginateDrops"));
  const repository = readFileSync("src/lib/community-sightings-repository.ts", "utf8");
  const query = repository.slice(repository.indexOf("async listSightingsFeed("), repository.indexOf("async listSightingsForReporter("));
  assert.ok(query.indexOf("$10::text IS NULL") < query.indexOf("LIMIT $1"));
  assert.match(query, /STRPOS/);
  assert.match(query, /search, searchStates/);
});
