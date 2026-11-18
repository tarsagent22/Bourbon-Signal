import {
  dropDisplayTime,
  compareDropFeedNewestFirst,
} from "./drop-feed-policy";
import { createHash } from "node:crypto";
import { catalogBottlePhoto } from "./bottle-photos";
import { BOTTLE_PRICING } from "@/data/bottles";

export type PublicMarketingDrop = {
  id: string;
  bottle: string;
  state: string;
  observedAt: string;
  location: string;
  rarity: string;
  eventType: string;
  scope: "board" | "store" | "area";
  confirmedAt?: string;
  artwork?: string;
  msrp?: number;
};
export function publicMarketingDrops(payload: unknown): PublicMarketingDrop[] {
  const p = payload as { drops?: Array<Record<string, unknown>> };
  return (Array.isArray(p?.drops) ? p.drops : [])
    .slice()
    .sort(compareDropFeedNewestFirst)
    .flatMap((d) => {
      const text = (keys: string[]) =>
        keys.map((k) => d[k]).find((v) => typeof v === "string" && v.trim()) as
          | string
          | undefined;
      const bottle = text([
        "canonical_name",
        "canonicalName",
        "bottle_name",
        "bottleName",
        "bourbonName",
        "raw_name",
        "rawName",
      ]);
      const state = text(["state", "state_code"]);
      const observedAt =
        dropDisplayTime(d) || text(["observed_at", "detected_at"]);
      const confirmed = text(["last_confirmed_at", "lastConfirmedAt"]);
      const confirmedAt =
        confirmed &&
        observedAt &&
        Date.parse(confirmed) === Date.parse(observedAt)
          ? confirmed
          : undefined;
      if (
        !bottle ||
        !state ||
        !/^[A-Z]{2}(?:-[A-Z]+)?$/.test(state) ||
        !observedAt ||
        !Number.isFinite(Date.parse(observedAt))
      )
        return [];
      const location = (text(["store_city", "city", "store_county"]) || state).slice(0, 100);
      const identity = JSON.stringify([bottle, state, location, observedAt, d.event_type, d.id]);
      const id = "report-" + createHash("sha256").update(identity).digest("hex").slice(0, 20);
      const art = catalogBottlePhoto({ id: "", canonicalName: bottle });
      const msrp = BOTTLE_PRICING[bottle.trim().toLowerCase()]?.msrp;
      // Only public state/city/county labels; never addresses, members, contacts or evidence.
      return [
        {
          id,
          ...(art ? { artwork: new URL(art.url).pathname } : {}),
          ...(msrp ? { msrp } : {}),
          bottle: bottle.slice(0, 180),
          state: state.slice(0, 24),
          observedAt:
            observedAt && Number.isFinite(Date.parse(observedAt))
              ? observedAt
              : "",
          location,
          ...(confirmedAt ? { confirmedAt } : {}),
          rarity: [
            "unicorn",
            "highly_allocated",
            "allocated",
            "limited",
            "core",
          ].includes(String(d.rarity_tier))
            ? String(d.rarity_tier)
            : "unknown",
          scope: d.event_type === "nc_board_shipment_snapshot" || (state === "NC" && d.availability_scope === "board") ? "board" as const : d.availability_scope === "store" ? "store" as const : "area" as const,
          eventType:
            typeof d.event_type === "string"
              ? d.event_type.slice(0, 80)
              : "unknown",
        },
      ];
    })
    .filter((drop, index, rows) => rows.findIndex(row => row.id === drop.id) === index)
    .slice(0, 6);
}
export async function readPublicMarketingFeed() {
  try {
    // Deliberately anonymous. Never forward the requesting owner's/session's cookies.
    const r = await fetch("https://www.bourbonsignal.com/api/drops?limit=7", {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { drops: [], unavailable: true };
    return { drops: publicMarketingDrops(await r.json()), unavailable: false };
  } catch {
    return { drops: [], unavailable: true };
  }
}
