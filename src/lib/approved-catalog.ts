export type ApprovedBottleCategory = "bourbon" | "rye" | "american_whiskey";
export type ApprovedBottleAvailability = "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn";

export interface ApprovedBottle {
  id: string;
  canonicalName: string;
  brand: string;
  category: ApprovedBottleCategory;
  availability: ApprovedBottleAvailability;
  buyerVerdict: "safe_to_pass" | "fair_buy" | "good_buy" | "grab_at_msrp" | "special_find" | "unknown";
  aliases: string[];
  isSignalTracked: false;
  isAlertEligible: false;
  summary: string;
  guidance: string;
  approvedBy: string;
  approvedAt: string;
  approvalSource: string;
}

export interface ApprovedLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  locationType: "store";
  precision: "store";
  inventoryCapability: "directory_only";
  source: "Admin-approved catalog";
  searchable: true;
  collectorAttached: false;
  hasSignals: false;
  approvedBy: string;
  approvedAt: string;
  approvalSource: string;
}

const AVAILABILITY = new Set<ApprovedBottleAvailability>(["common", "regional", "seasonal", "limited", "allocated", "highly_allocated", "unicorn"]);
const CATEGORIES = new Set<ApprovedBottleCategory>(["bourbon", "rye", "american_whiskey"]);

export function approvedCatalogKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function buildApprovedBottle(input: {
  canonicalName: string;
  brand: string;
  category: ApprovedBottleCategory;
  availability: ApprovedBottleAvailability;
}, approvedBy: string, approvalSource: string, now = new Date().toISOString()): ApprovedBottle {
  const canonicalName = clean(input.canonicalName, 160);
  const brand = clean(input.brand, 100);
  if (canonicalName.length < 2) throw new Error("Canonical bottle name is required.");
  if (brand.length < 2) throw new Error("Bottle brand is required.");
  if (!CATEGORIES.has(input.category)) throw new Error("Unsupported bottle category.");
  if (!AVAILABILITY.has(input.availability)) throw new Error("Unsupported bottle availability.");
  const id = approvedCatalogKey(canonicalName);
  if (!id) throw new Error("Canonical bottle name is invalid.");
  const special = input.availability === "unicorn" || input.availability === "highly_allocated";
  const scarce = special || input.availability === "allocated" || input.availability === "limited";
  return {
    id,
    canonicalName,
    brand,
    category: input.category,
    availability: input.availability,
    buyerVerdict: special ? "special_find" : scarce ? "grab_at_msrp" : input.availability === "common" ? "safe_to_pass" : "fair_buy",
    aliases: [canonicalName],
    isSignalTracked: false,
    isAlertEligible: false,
    summary: "An administrator-approved Bottle Bible entry awaiting independent inventory evidence.",
    guidance: "Use verified local inventory signals before deciding whether to chase this bottle.",
    approvedBy: clean(approvedBy, 160),
    approvedAt: now,
    approvalSource: clean(approvalSource, 80),
  };
}

export function buildApprovedLocation(input: {
  name: string;
  address?: string;
  city: string;
  state: string;
  zip?: string;
}, approvedBy: string, approvalSource: string, now = new Date().toISOString()): ApprovedLocation {
  const name = clean(input.name, 180);
  const address = clean(input.address, 220);
  const city = clean(input.city, 120);
  const state = clean(input.state, 2).toUpperCase();
  const zip = clean(input.zip, 12);
  if (name.length < 2) throw new Error("Store name is required.");
  if (!/^[A-Z]{2}$/.test(state)) throw new Error("Two-letter store state is required.");
  if (city.length < 2) throw new Error("Store city is required.");
  const identity = approvedCatalogKey([state, name, address || city, zip].join(" "));
  return {
    id: `approved-store:${state.toLowerCase()}:${identity}`,
    name,
    address,
    city,
    state,
    ...(zip ? { zip } : {}),
    locationType: "store",
    precision: "store",
    inventoryCapability: "directory_only",
    source: "Admin-approved catalog",
    searchable: true,
    collectorAttached: false,
    hasSignals: false,
    approvedBy: clean(approvedBy, 160),
    approvedAt: now,
    approvalSource: clean(approvalSource, 80),
  };
}
