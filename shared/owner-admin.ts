export type BottleDraft = {
  canonicalName: string;
  brand: string;
  producer: string;
  category: string;
  proof: number | null;
  ageStatement: string;
  availability: string;
  aliases: string[];
  summary: string;
  guidance: string;
};
export function validateBottleDraft(input: unknown): BottleDraft {
  if (!input || typeof input !== "object")
    throw new Error("Bottle details are required.");
  const r = input as Record<string, unknown>;
  const clean = (key: string, max = 160) =>
    typeof r[key] === "string"
      ? (r[key] as string).trim().replace(/\s+/g, " ").slice(0, max)
      : "";
  const canonicalName = clean("canonicalName"),
    brand = clean("brand"),
    category = clean("category"),
    availability = clean("availability");
  if (canonicalName.length < 2 || brand.length < 2)
    throw new Error("Enter the exact bottle name and brand.");
  if (!["bourbon", "rye", "american_whiskey"].includes(category))
    throw new Error("Choose a whiskey category.");
  if (
    ![
      "common",
      "regional",
      "seasonal",
      "limited",
      "allocated",
      "highly_allocated",
      "unicorn",
    ].includes(availability)
  )
    throw new Error("Choose availability.");
  const proof =
    r.proof === null || r.proof === "" || r.proof === undefined
      ? null
      : Number(r.proof);
  if (proof !== null && (!Number.isFinite(proof) || proof <= 0 || proof > 200))
    throw new Error("Proof must be greater than 0 and at most 200.");
  const aliases = Array.isArray(r.aliases)
    ? r.aliases
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 40)
    : [];
  return {
    canonicalName,
    brand,
    category,
    availability,
    proof,
    producer: clean("producer"),
    ageStatement: clean("ageStatement", 100),
    aliases: [...new Set([canonicalName, ...aliases])],
    summary: clean("summary", 1000),
    guidance: clean("guidance", 1000),
  };
}
export function adminReason(value: unknown) {
  const reason = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (reason.length < 3) throw new Error("Add a reason for the change.");
  return reason;
}
export function adminRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
export function adminSightingChanges<T extends Record<string, unknown>>(
  original: T,
  changes: Record<string, unknown>,
  bottle: { id: string; canonicalName: string; availability: string },
  actor: string,
  reason: string,
) {
  const clean = (k: string, max: number) =>
    typeof changes[k] === "string"
      ? (changes[k] as string).trim().slice(0, max)
      : String(original[k] || "");
  const storeName = clean("storeName", 180),
    storeAddress = clean("storeAddress", 220),
    storeCity = clean("storeCity", 120),
    storeState = clean("storeState", 2).toUpperCase();
  if (storeName.length < 2 || (original.sightingType !== 'online_social' && (!/^[A-Z]{2}$/.test(storeState) || !storeCity)) || (storeState && !/^[A-Z]{2}$/.test(storeState)))
    throw new Error("Enter the store name, city and two-letter state.");
  const price =
    changes.price === "" || changes.price === null
      ? null
      : changes.price === undefined
        ? original.price
        : Number(changes.price);
  if (
    price != null &&
    (!Number.isFinite(price) || Number(price) < 0 || Number(price) > 100000)
  )
    throw new Error("Enter a valid price.");
  return {
    ...original,
    bottleId: bottle.id,
    bottleName: bottle.canonicalName,
    rarityTier:
      bottle.availability === "unicorn"
        ? "unicorn"
        : ["allocated", "highly_allocated"].includes(bottle.availability)
          ? "allocated"
          : "limited",
    storeName,
    storeAddress,
    storeCity,
    storeState,
    storeZip: clean("storeZip", 12),
    price,
    quantityEstimate: clean("quantityEstimate", 80),
    notes: clean("notes", 1000),
    reviewState: {
      ...adminRecord(original.reviewState),
      needsBottleReview: false,
      needsStoreReview: false,
      manualBottleName: undefined,
      manualBottleRarityTier: undefined,
      manualStoreName: undefined,
      manualStoreAddress: undefined,
      manualStoreCity: undefined,
      manualStoreState: undefined,
      manualStoreZip: undefined,
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor,
      reviewNote: "Bottle and store details corrected by an administrator.",
    },
  };
}
