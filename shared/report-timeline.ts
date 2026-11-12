export type TimelineMode = "saved" | "browse" | "bottle";
export type TimelineSource = "sightings" | "stores" | "shipments";
export interface TimelineRequest {
  mode: TimelineMode;
  source?: TimelineSource;
  older?: boolean;
  bottleId?: string;
}
export interface ShipmentBottle {
  signalId: string;
  id?: string;
  name: string;
  tier?: "limited" | "allocated" | "unicorn";
  quantity?: number;
}
export interface ShipmentUpdate {
  key: string;
  bottles: ShipmentBottle[];
}
