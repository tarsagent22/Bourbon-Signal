import { cityIsInMontgomeryCountyMaryland } from "./maryland-montgomery.ts";

type ActivityLevel = "state" | "county" | "city" | "board" | "store";
type ActivityEntry = { id?: string; level: ActivityLevel; state: string; name: string; rawId?: string };

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function placeToken(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/\b(city|town|village|cdp|county|parish|borough|census area|municipality)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countCommunityActivity(sightings: readonly unknown[], entry: ActivityEntry) {
  return sightings.reduce<number>((total, raw) => {
    const sighting = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (text(sighting.storeState).toUpperCase() !== entry.state) return total;
    const matches = entry.level === "state"
      || (entry.level === "city" && Boolean(placeToken(entry.name) && placeToken(sighting.storeCity) === placeToken(entry.name)))
      || (entry.level === "county" && (
        (entry.id === "county:24031" && entry.state === "MD" && cityIsInMontgomeryCountyMaryland(text(sighting.storeCity)))
        || Boolean(placeToken(entry.name) && placeToken(sighting.storeCounty) === placeToken(entry.name))
      ))
      || (entry.level === "store" && Boolean(entry.rawId && text(sighting.storeId) === entry.rawId))
      || (entry.level === "board" && Boolean(placeToken(entry.name) && [sighting.storeBoard, sighting.boardName].some((value) => placeToken(value) === placeToken(entry.name))));
    return total + (matches ? Math.max(1, Number(sighting.count) || 1) : 0);
  }, 0);
}
