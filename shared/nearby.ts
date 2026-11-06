import type { Signal } from "../apps/mobile/src/api/types";
export type Point = { latitude: number; longitude: number };
export type NearbyStore = Point & {
  kind?: "board";
  members?: BoardMember[];
  sourceUrl?: string;
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  distance: number;
  approximateLocation?: boolean;
  signals: Signal[];
};
export type BoardMember = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  approximateLocation?: boolean;
};
export type NearbyResult = {
  stores: NearbyStore[];
  // Separate from exact-store results for older installed clients.
  boards?: NearbyStore[];
  partial: boolean;
  unmapped: number;
  previewLocked: boolean;
  // Same-city reports without verified coordinates; never pins or radius claims.
  unlocated?: Signal[];
};
export function validPoint(p: Point) {
  return (
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}
export function miles(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * rad,
    dlng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dlng / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
