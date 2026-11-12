import directory from "../data/nearby-board-directory.json" with { type: "json" };
import reviewed from "../data/reviewed-store-coordinates.json" with { type: "json" };
import { canonicalNcAbcBoardEvidence } from "./nc-abc-boards.ts";
import { sightingStoreAddressKey } from "./sighting-store-directory-core.ts";
import {
  miles,
  validPoint,
  type NearbyStore,
  type BoardMember,
  type Point,
} from "../../shared/nearby.ts";
import type { Signal } from "../../apps/mobile/src/api/types.ts";

// Official board membership and official marker coordinates. Address-reviewed
// positions can fill missing markers, but never establish board membership.
const reviewedByAddress = new Map(
  reviewed.stores
    .filter((s) => s.state === "NC")
    .map((s) => [sightingStoreAddressKey(s), s]),
);
const boards = directory.boards.map((board) => ({
  ...board,
  members: board.members.map((raw) => {
    const member: BoardMember = raw;
    if (
      typeof member.latitude === "number" &&
      typeof member.longitude === "number"
    )
      return member;
    const proof = reviewedByAddress.get(sightingStoreAddressKey(member));
    return proof
      ? {
          ...member,
          latitude: proof.lat,
          longitude: proof.lng,
          approximateLocation: true,
        }
      : member;
  }),
}));

const boardByMemberAddress = new Map(boards.flatMap(board =>
  board.members.map(member => [sightingStoreAddressKey(member), board] as const)
));

export function boardForExactMemberStore(store: { state: string; city: string; address: string }) {
  return store.state === "NC" && store.city && store.address ? boardByMemberAddress.get(sightingStoreAddressKey(store)) : undefined;
}

export function boardMemberStores(boardId: string): BoardMember[] {
  return boards.find(board => board.id === boardId)?.members ?? [];
}

export function nearbyBoards(origin: Point, radius: number): NearbyStore[] {
  return boards.flatMap((board) => {
    const members = board.members
      .map((member) => ({
        ...member,
        distance:
          typeof member.latitude === "number" &&
          typeof member.longitude === "number" &&
          validPoint({ latitude: member.latitude, longitude: member.longitude })
            ? miles(origin, {
                latitude: member.latitude,
                longitude: member.longitude,
              })
            : undefined,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    const mapped = members.filter((m) => m.distance !== undefined);
    if (!mapped.length || mapped[0].distance! > radius) return [];
    // Representative board marker near the nearest member, not a delivery
    // destination. Radius membership uses every member, never a centroid.
    return [
      {
        id: board.id,
        kind: "board" as const,
        name: board.filterLabel,
        address: "Shipment reported · Receiving stores unconfirmed",
        city: "",
        state: "NC",
        latitude: mapped[0].latitude!,
        longitude: mapped[0].longitude!,
        distance: mapped[0].distance!,
        sourceUrl: board.sourceUrl,
        members,
        signals: [],
      },
    ];
  });
}
export function boardDropName(drop: Record<string, unknown>) {
  if (
    String(drop.state ?? drop.state_code) !== "NC" ||
    String(drop.type ?? drop.event_type) !== "nc_board_shipment_snapshot"
  )
    return null;
  return canonicalNcAbcBoardEvidence(
    drop.locationName ?? drop.display_location,
  );
}
export function addBoardSignals(
  signals: Signal[],
  candidates: NearbyStore[],
  found: Map<string, NearbyStore>,
) {
  for (const signal of signals) {
    if (!signal.shipment || signal.location.state !== "NC") continue;
    const board = candidates.find((b) => b.id === signal.shipment!.boardId);
    if (!board) continue;
    const entry = found.get(board.id) || { ...board, signals: [] };
    const duplicate = entry.signals.findIndex(previous => previous.id === signal.id ||
      Boolean(signal.bottle.id && previous.bottle.id === signal.bottle.id && signal.shipment?.reportedAt
        && previous.shipment?.reportedAt === signal.shipment.reportedAt));
    if (duplicate < 0) entry.signals.push(signal);
    else if (entry.signals[duplicate].availability?.price == null && signal.availability?.price != null) entry.signals[duplicate] = signal;
    found.set(board.id, entry);
  }
}
