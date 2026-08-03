import { createHash } from "node:crypto";
import { canonicalBottleId } from "../data/bottle-identity-redirects";
import {
  normalizeBottleScarcity,
  resolveBottleScarcity,
  SCARCITY_TIERS,
  type BottleScarcityMetadata,
  type ScarcityTier,
} from "./bottle-scarcity";

export const DROP_FEED_CLASSIFICATION_TIERS = ["unicorn", "highly_allocated", "allocated", "limited"] as const;

export type DropFeedClassificationTier = (typeof DROP_FEED_CLASSIFICATION_TIERS)[number];
export type DropClassificationSource = "state_override" | "national_baseline" | "signal";

export type DropClassificationBottle = BottleScarcityMetadata & {
  id: string;
  canonicalName: string;
  aliases?: string[];
};

type DropClassificationInput = Record<string, unknown>;

export interface DropClassificationIndex {
  byId: Map<string, DropClassificationBottle>;
  byName: Map<string, DropClassificationBottle | null>;
  version: string;
}

const indexCache = new WeakMap<object, DropClassificationIndex>();

export interface ResolvedDropClassification {
  tier: ScarcityTier | string;
  source: DropClassificationSource;
  state: string | null;
  bottleId: string | null;
  nationalTier: ScarcityTier | null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stateCode(drop: DropClassificationInput) {
  const raw = text(drop.state ?? drop.state_code ?? drop.stateCode).toUpperCase();
  return /^([A-Z]{2})(?:[-_].*)?$/.exec(raw)?.[1] || null;
}

function signalTier(drop: DropClassificationInput) {
  const raw = text(drop.rarity_tier ?? drop.tier)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (SCARCITY_TIERS as readonly string[]).includes(raw) ? raw : raw || "unknown";
}

function addName(index: DropClassificationIndex, value: unknown, bottle: DropClassificationBottle) {
  const normalized = normalizeName(value);
  if (!normalized) return;
  const existing = index.byName.get(normalized);
  if (existing && existing.id !== bottle.id) {
    index.byName.set(normalized, null);
    return;
  }
  if (existing === undefined) index.byName.set(normalized, bottle);
}

export function buildDropClassificationIndex(
  bottles: DropClassificationBottle[],
): DropClassificationIndex {
  const index: DropClassificationIndex = { byId: new Map(), byName: new Map(), version: "" };
  const versionRows: string[] = [];

  for (const rawBottle of bottles) {
    const bottle = {
      ...rawBottle,
      ...normalizeBottleScarcity(rawBottle as unknown as Record<string, unknown>),
    } as DropClassificationBottle;
    const id = canonicalBottleId(bottle.id);
    const canonicalBottle = id === bottle.id ? bottle : { ...bottle, id };
    index.byId.set(id, canonicalBottle);
    index.byId.set(bottle.id, canonicalBottle);
    addName(index, canonicalBottle.canonicalName, canonicalBottle);
    for (const alias of canonicalBottle.aliases || []) addName(index, alias, canonicalBottle);
    versionRows.push(JSON.stringify({
      id,
      sourceId: bottle.id,
      canonicalName: canonicalBottle.canonicalName,
      aliases: [...(canonicalBottle.aliases || [])].sort(),
      nationalTier: canonicalBottle.nationalTier,
      nationalConfidence: canonicalBottle.nationalConfidence,
      scarcityLastReviewedAt: canonicalBottle.scarcityLastReviewedAt,
      stateOverrides: [...(canonicalBottle.stateOverrides || [])]
        .map((override) => ({ ...override, sourceIds: [...override.sourceIds].sort() }))
        .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction)),
    }));
  }

  index.version = createHash("sha256").update(versionRows.sort().join("\n")).digest("hex").slice(0, 16);
  return index;
}

export function getDropClassificationIndex(bottles: DropClassificationBottle[]) {
  const cached = indexCache.get(bottles);
  if (cached) return cached;
  const index = buildDropClassificationIndex(bottles);
  indexCache.set(bottles, index);
  return index;
}

function findBottle(drop: DropClassificationInput, index: DropClassificationIndex) {
  const ids = [
    drop.canonical_id,
    drop.canonicalId,
    drop.bottle_id,
    drop.bottleId,
  ];
  for (const value of ids) {
    const rawId = text(value);
    if (!rawId) continue;
    const bottle = index.byId.get(canonicalBottleId(rawId)) || index.byId.get(rawId);
    if (bottle) return bottle;
  }

  const names = [
    drop.canonical_name,
    drop.canonicalName,
    drop.bottle_name,
    drop.bottleName,
    drop.brand_name,
    drop.tracked_brand_name,
    drop.raw_name,
    drop.rawName,
  ];
  for (const value of names) {
    const normalized = normalizeName(value);
    if (!normalized) continue;
    const bottle = index.byName.get(normalized);
    if (bottle) return bottle;
  }
  return null;
}

export function resolveDropClassification(
  drop: DropClassificationInput,
  index: DropClassificationIndex,
): ResolvedDropClassification {
  const state = stateCode(drop);
  const bottle = findBottle(drop, index);
  if (!bottle) {
    return {
      tier: signalTier(drop),
      source: "signal",
      state,
      bottleId: null,
      nationalTier: null,
    };
  }

  const resolved = resolveBottleScarcity(bottle, state || undefined);
  return {
    tier: resolved.marketTier,
    source: resolved.classificationSource,
    state,
    bottleId: bottle.id,
    nationalTier: resolved.nationalTier,
  };
}
