import { presentSignal, signalCardAppearance } from "../api/presentation";
import type { RadarBottleOption, Signal, SightingSubmission } from "../api/types";
import { buildManualStoreId } from "./manual-sighting";

export const POST_QUANTITY_CHOICES = ["1", "2", "3–5", "6+"] as const;

export interface PostStoreSelection {
  id: string | null;
  name: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
}

export interface PostSignalPreview {
  sourceLabel: "COMMUNITY";
  contextLabel: "LIMITED" | "ALLOCATED" | "UNICORN";
  timeLabel: "Now";
  bottleName: string;
  storeName: string;
  geography: string;
  price?: string;
  quantity?: string;
  note?: string;
  reporter?: string;
  surface: string;
  keyline: string;
  accent: string;
  secondaryText: string;
}

export function buildPostSignalPreview(input: {
  bottleName: string;
  bottleRarity?: RadarBottleOption["rarity"];
  storeName: string;
  storeAddress: string;
  storeCity: string;
  storeState: string;
  price: string;
  quantity: string;
  notes: string;
  reporter?: string;
}): PostSignalPreview | null {
  const bottleName = input.bottleName.trim();
  const storeName = input.storeName.trim();
  const storeAddress = input.storeAddress.trim();
  const storeCity = input.storeCity.trim();
  const storeState = input.storeState.trim().toUpperCase();
  if (!bottleName || !storeName || !storeAddress || !storeCity || !/^[A-Z]{2}$/.test(storeState)) return null;

  const parsedPrice = Number(input.price.trim().replace(/[$,]/g, ""));
  const quantity = input.quantity.trim();
  const note = input.notes.trim();
  const reporter = input.reporter?.trim() || "";
  const previewSignal: Signal = {
    contractVersion: "bourbon-signal/signal@1",
    id: "member:post-preview",
    kind: "availability",
    source: { type: "member", label: reporter || "Member", reportMode: "seen_in_store" },
    bottle: { name: bottleName, rarity: input.bottleRarity || "limited" },
    location: { scope: "exact_store", state: storeState, store: { name: storeName, address: storeAddress, city: storeCity, state: storeState } },
    timing: { displayAt: new Date(0).toISOString() },
    evidence: { ...(note ? { summary: note } : {}), photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: false },
    strength: "more_activity",
    availability: {
      status: "reported",
      ...(Number.isFinite(parsedPrice) && parsedPrice > 0 ? { price: parsedPrice } : {}),
      ...(quantity ? { quantityLabel: quantity } : {}),
    },
    alertEligibility: { inventory: false, watch: true },
    actions: [],
  };
  const presented = presentSignal(previewSignal);
  const appearance = signalCardAppearance(previewSignal);

  return {
    sourceLabel: "COMMUNITY",
    contextLabel: appearance.rarityLabel as PostSignalPreview["contextLabel"],
    timeLabel: "Now",
    bottleName,
    storeName: presented.storeName,
    geography: presented.geography,
    price: presented.price,
    quantity: presented.quantity,
    ...(presented.summary ? { note: presented.summary } : {}),
    ...(reporter ? { reporter: `Reported by ${reporter}` } : {}),
    surface: appearance.surface,
    keyline: appearance.keyline,
    accent: appearance.accent,
    secondaryText: appearance.secondaryText,
  };
}

export function approvedStoreFromGeography(entry: {
  id: string;
  storeId?: string;
  level: string;
  state: string;
  name: string;
  address?: string;
  city?: string;
  zip?: string;
}): PostStoreSelection | null {
  const storeId = entry.storeId?.trim() || "";
  const name = entry.name.trim();
  const address = entry.address?.trim() || "";
  const city = entry.city?.trim() || "";
  const state = entry.state.trim().toUpperCase();
  if (entry.level !== "store" || !storeId || !name || !address || !city || !/^[A-Z]{2}$/.test(state)) return null;
  return { id: storeId, name, address, city, state, ...(entry.zip?.trim() ? { zip: entry.zip.trim() } : {}) };
}

export function rankApprovedStoreSuggestions(stores: PostStoreSelection[], query: string, limit = 6) {
  const normalize = (value: string) => value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const needle = normalize(query);
  if (!needle || limit <= 0) return [];
  const queryTokens = needle.split(" ");

  return stores
    .map((store) => {
      const name = normalize(store.name);
      const nameTokens = name.split(" ");
      const combined = normalize([store.name, store.city, store.state, store.address, store.zip].filter(Boolean).join(" "));
      const combinedTokens = combined.split(" ");
      const tokenMatch = (tokens: string[]) => queryTokens.every((queryToken) => tokens.some((token) => token.startsWith(queryToken)));
      const score = name === needle ? 0
        : name.startsWith(needle) ? 1
          : name.includes(needle) ? 2
            : tokenMatch(nameTokens) ? 3
              : combined.includes(needle) ? 4
                : tokenMatch(combinedTokens) ? 5
                  : null;
      return { store, score };
    })
    .filter((match): match is { store: PostStoreSelection; score: number } => match.score !== null)
    .sort((left, right) => left.score - right.score
      || left.store.name.localeCompare(right.store.name)
      || left.store.city.localeCompare(right.store.city)
      || String(left.store.id).localeCompare(String(right.store.id)))
    .slice(0, Math.floor(limit))
    .map(({ store }) => store);
}

export function isPostRequiredComplete(input: {
  bottleName: string;
  storeName: string;
  storeAddress: string;
  storeCity: string;
  storeState: string;
}) {
  return Boolean(
    input.bottleName.trim()
    && input.storeName.trim()
    && input.storeAddress.trim()
    && input.storeCity.trim()
    && /^[A-Za-z]{2}$/.test(input.storeState.trim()),
  );
}

export function buildPostSightingSubmission(input: {
  bottleName: string;
  bottleId?: string | null;
  bottleRarity?: RadarBottleOption["rarity"];
  store: PostStoreSelection;
  price: string;
  quantity: string;
  notes: string;
}): { ok: true; payload: SightingSubmission } | { ok: false; error: string } {
  const bottleName = input.bottleName.trim();
  const storeName = input.store.name.trim();
  const storeAddress = input.store.address.trim();
  const storeCity = input.store.city.trim();
  const storeState = input.store.state.trim().toUpperCase();
  if (!isPostRequiredComplete({ bottleName, storeName, storeAddress, storeCity, storeState })) {
    return { ok: false, error: "Add the bottle, store, street address, city, and two-letter state." };
  }
  const parsedPrice = input.price.trim() ? Number(input.price.replace(/[$,]/g, "")) : null;
  if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
    return { ok: false, error: "Enter a valid shelf price or leave it blank." };
  }
  const approvedStoreId = input.store.id?.trim() || "";
  const manualStore = !approvedStoreId;
  const payload: SightingSubmission = {
    bottleName,
    ...(input.bottleId?.trim() ? { bottleId: input.bottleId.trim() } : {}),
    ...(input.bottleRarity ? { rarityTier: input.bottleRarity } : {}),
    storeId: approvedStoreId || buildManualStoreId(storeName, storeAddress, storeCity, storeState),
    storeName,
    storeAddress,
    storeCity,
    storeState,
    ...(input.store.zip?.trim() ? { storeZip: input.store.zip.trim() } : {}),
    quantityEstimate: input.quantity.trim() || undefined,
    price: parsedPrice,
    notes: input.notes.trim() || undefined,
    sightingType: "seen_in_store",
    ...(manualStore ? {
      reviewState: {
        needsStoreReview: true,
        manualStoreName: storeName,
        manualStoreCity: storeCity,
        manualStoreState: storeState,
        ...(input.store.zip?.trim() ? { manualStoreZip: input.store.zip.trim() } : {}),
      },
    } : {}),
  };
  return { ok: true, payload };
}
