import test from "node:test";
import assert from "node:assert/strict";
import {
  nearbyBoards,
  addBoardSignals,
  boardDropName,
} from "../src/lib/nearby-boards";
import {
  withNearbyFeedScope,
  filterNearbyFeedDrops,
} from "../src/lib/nearby-feed-scope";
import { nearbyStoreIndex, addNearbySignals } from "../src/lib/nearby";
import { normalizeDropSignal } from "../src/lib/signals/signal-contract";
import { nearbyVisible } from "../apps/mobile/src/signals/nearby";
import type { NearbyStore } from "../shared/nearby";
import directory from "../src/data/nearby-board-directory.json";
const origin = { latitude: 35.78, longitude: -78.64 };
const drop = {
  id: "shipment",
  state: "NC",
  event_type: "nc_board_shipment_snapshot",
  display_location: "Wake County ABC",
  location_precision: "board_county",
  availability_scope: "board",
  quantity_shipped: 414,
  bottle_name: "Henry McKenna 10 Year",
  event_at: "2026-11-05T12:00:00Z",
  can_alert_as_inventory: false,
};
test("board shipments retain identity, source date and units without becoming inventory", () => {
  const signal = normalizeDropSignal(drop);
  assert.equal(signal.shipment?.quantity, 414);
  assert.equal(signal.shipment?.unit, "units");
  assert.equal(signal.shipment?.reportedAt, drop.event_at);
  assert.equal(signal.alertEligibility.inventory, false);
  assert.equal(signal.location.scope, "board");
  const boards = nearbyBoards(origin, 25),
    found = new Map<string, NearbyStore>();
  addBoardSignals([signal, signal], boards, found);
  assert.equal(found.size, 1);
  assert.equal([...found.values()][0].signals.length, 1);
  const exact = new Map<string, NearbyStore>();
  addNearbySignals([signal], nearbyStoreIndex([]), origin, 25, exact);
  assert.equal(exact.size, 0);
  assert.equal(
    nearbyVisible([...found.values()], 25, true, ["Unrelated"]).length,
    0,
  );
});
test("a board is nearby if any verified member is nearby, across NC and near state borders", () => {
  let checked = 0;
  for (const board of directory.boards) {
    const member = board.members.find(
      (m) => "latitude" in m && typeof m.latitude === "number",
    );
    if (!member || !("latitude" in member) || !("longitude" in member))
      continue;
    assert.ok(
      nearbyBoards(
        { latitude: member.latitude, longitude: member.longitude },
        10,
      ).some((b) => b.id === board.id),
      board.label,
    );
    checked++;
  }
  assert.ok(checked >= 160);
  assert.equal(
    nearbyBoards({ latitude: 33.35, longitude: -111.79 }, 100).length,
    0,
  );
});
test("board scope precedes pagination without requiring a city and stays request local", async () => {
  const boards = nearbyBoards(origin, 25);
  const distant = {
    ...drop,
    id: "far",
    display_location: "Mecklenburg County ABC",
  };
  const result = await withNearbyFeedScope(
    nearbyStoreIndex([]),
    origin,
    25,
    async () => filterNearbyFeedDrops([drop, distant]),
    undefined,
    new Set(boards.map((b) => b.name)),
  );
  assert.deepEqual(result, [drop]);
  assert.equal(filterNearbyFeedDrops([drop, distant]).length, 2);
});
test("warehouse, unknown board, wrong state and ordinary store reports never become board shipments", () => {
  for (const change of [
    { event_type: "nc_statewide_warehouse_stock" },
    { display_location: "Unknown ABC" },
    { state: "VA" },
    { event_type: "store_inventory_result" },
  ]) {
    const row = { ...drop, ...change };
    assert.equal(normalizeDropSignal(row).shipment, undefined);
    assert.equal(boardDropName(row), null);
  }
});
test("official directory pins preserve board membership and never carry shipment quantities", () => {
  for (const b of nearbyBoards(origin, 100)) {
    assert.ok(b.members?.length);
    assert.equal(b.kind, "board");
    assert.equal(b.signals.length, 0);
    assert.ok(b.members!.every((m) => !("signals" in m) && !("quantity" in m)));
    assert.ok(b.distance <= 100);
  }
});
