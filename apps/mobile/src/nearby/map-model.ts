import type { NearbyStore, Point } from "../../../../shared/nearby";
export type MapRegion = Point & {
  latitudeDelta: number;
  longitudeDelta: number;
};
export function radiusRegion(point: Point, radius: number): MapRegion {
  return {
    ...point,
    latitudeDelta: radius / 28,
    longitudeDelta: Math.min(
      170,
      radius / (28 * Math.max(0.2, Math.cos((point.latitude * Math.PI) / 180))),
    ),
  };
}
export function clusterStores(stores: NearbyStore[], region: MapRegion) {
  const groups = new Map<string, NearbyStore[]>();
  const step = region.latitudeDelta / 8,
    lngStep = region.longitudeDelta / 6;
  for (const s of stores) {
    const longitudeOffset = Math.abs(((s.longitude - region.longitude + 540) % 360) - 180);
    if (Math.abs(s.latitude - region.latitude) > region.latitudeDelta * 0.75 || longitudeOffset > region.longitudeDelta * 0.75) continue;
    const key =
      region.latitudeDelta < 0.002
        ? s.id
        : `${Math.floor(s.latitude / step)}:${Math.floor(s.longitude / lngStep)}`;
    const rows = groups.get(key) || [];
    rows.push(s);
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([id, stores]) => ({
    id,
    stores,
    latitude: stores.reduce((n, s) => n + s.latitude, 0) / stores.length,
    longitude: stores.reduce((n, s) => n + s.longitude, 0) / stores.length,
  }));
}
export interface NearbyMapProps {
  origin: Point | null;
  radius: number;
  stores: NearbyStore[];
  selected: string | null;
  sightingPins?: NearbyStore[];
  onSightingPress?: (id: string) => void;
  showMembers?: boolean;
  onSelect: (id: string) => void;
  onSearchArea: (point: Point) => void;
  bottomInset: number;
}
