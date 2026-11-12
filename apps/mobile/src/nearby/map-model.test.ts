import type { NearbyResult } from "../../../../shared/nearby";
import { mapFeedRows, readNearbyPreview, saveNearbyPreview, clearNearbyPreview } from "./map-feed";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { clusterStores, radiusRegion } from "./map-model";
import type { NearbyStore } from "../../../../shared/nearby";
const store = (id: string, latitude: number, longitude: number) =>
  ({ id, latitude, longitude, signals: [] }) as unknown as NearbyStore;
test("dense stores cluster without losing stores, then separate at street zoom", () => {
  const rows = Array.from({ length: 200 }, (_, i) =>
    store(String(i), 33.352 + i / 1000000, -111.789),
  );
  const broad = clusterStores(rows, radiusRegion(rows[0], 25));
  assert.ok(broad.length < rows.length / 10);
  assert.deepEqual(
    broad.flatMap((g) => g.stores.map((s) => s.id)).sort(),
    rows.map((s) => s.id).sort(),
  );
  assert.equal(
    clusterStores(rows, {
      ...rows[0],
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    }).length,
    200,
  );
});
test("radius framing stays finite at high latitudes", () => {
  for (const latitude of [-90, 0, 33, 90]) {
    const r = radiusRegion({ latitude, longitude: 0 }, 100);
    assert.ok(Number.isFinite(r.longitudeDelta));
    assert.ok(r.longitudeDelta <= 170);
  }
});
test("nearby and feed copy must remain UTF-8 without mojibake", () => {
  for (const file of [
    "../../app/(app)/nearby.tsx",
    "../../app/(app)/(tabs)/index.tsx",
  ])
    assert.doesNotMatch(
      readFileSync(new URL(file, import.meta.url), "utf8"),
      /\u00c3|\u00c2|\u00e2\u20ac|\u00e2\u201a/,
    );
});

test("offscreen stores do not create native markers", () => {
 const center = {latitude:33.352,longitude:-111.789};
 const rows = [store("visible",center.latitude,center.longitude),...Array.from({length:10000},(_,i)=>store(String(i),40+i/100000,-80))];
 assert.deepEqual(clusterStores(rows,radiusRegion(center,25)).flatMap(g=>g.stores.map(s=>s.id)),["visible"]);
});

const result = { stores: [], partial: false, unmapped: 0, previewLocked: false } satisfies NearbyResult;
test('nearby previews cannot cross accounts, membership revisions, query scopes, or TTL', () => {
  const account = {}, otherAccount = {}, revisedMembership = {};
  saveNearbyPreview(account, 'lat=1&radius=25', result, 1000);
  assert.equal(readNearbyPreview(account, 'lat=1&radius=25', 1001), result);
  for (const owner of [otherAccount, revisedMembership]) assert.equal(readNearbyPreview(owner, 'lat=1&radius=25', 1001), null);
  assert.equal(readNearbyPreview(account, 'lat=2&radius=25', 1001), null);
  assert.equal(readNearbyPreview(account, 'lat=1&radius=25', 601000), null);
  clearNearbyPreview(account);
  assert.equal(readNearbyPreview(account, 'lat=1&radius=25', 1002), null);
});
test('preview memory stays bounded while browsing many map areas', () => {
  const owner = {};
  for (let i = 0; i < 50; i++) saveNearbyPreview(owner, String(i), result, 1000);
  assert.equal(readNearbyPreview(owner, '43', 1001), null);
  assert.equal(readNearbyPreview(owner, '44', 1001), result);
  assert.equal(readNearbyPreview(owner, '49', 1001), result);
});
test('map feed retains each report and its exact store even when bottle reports share IDs', () => {
  const stores = [
    { id: 'a', signals: [{ id: 'shared' }, { id: 'other' }] },
    { id: 'b', signals: [{ id: 'shared' }] },
  ] as NearbyStore[];
  const rows = mapFeedRows(stores);
  assert.deepEqual(rows.map(row => row.key), ['a:shared', 'a:other', 'b:shared']);
  assert.equal(rows[2].store, stores[1]);
});
