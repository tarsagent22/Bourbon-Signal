import {brotliCompressSync,brotliDecompressSync,constants} from "node:zlib";
import {unstable_cache} from "next/cache";
import reviewed from "../data/sighting-store-directory.generated.json";
import {readBundledSiteExport,readSiteExportResults} from "./site-engine-contract";
import {listApprovedLocations} from "./approved-catalog-service";
import {mergeSightingStoreRows,normalizeSightingStore,sightingStoreAddressKey,type SightingStoreDirectoryEntry} from "./sighting-store-directory-core";
import {createAsyncPreparedDropCache} from "./prepared-drop-cache";

export const SIGHTING_STORE_DIRECTORY_VERSION = reviewed.generatedAt;
const reviewedRows = reviewed.stores as Array<Record<string, unknown>>;
const completeOfficialStates = new Set(["NC", "VA", "UT", "ID", "NY", "CO", "CA", "TX", "KY", "FL", "SC", "TN"]);
const officialAddresses = new Set(reviewedRows.filter(row => completeOfficialStates.has(String(row.state))).flatMap(row => {
  const store = normalizeSightingStore(row);
  return store ? [sightingStoreAddressKey(store)] : [];
}));
const memory = createAsyncPreparedDropCache<SightingStoreDirectoryEntry[]>(300_000);

const readPackedDirectory = unstable_cache(async () => {
  const [exports, approved] = await Promise.allSettled([
    readSiteExportResults(["locations", "stores"]), listApprovedLocations(),
  ]);
  const runtime = exports.status === "fulfilled" ? exports.value.flatMap(result => {
    const payload = result.payload;
    return [...(Array.isArray(payload?.locations) ? payload.locations : []), ...(Array.isArray(payload?.stores) ? payload.stores : [])];
  }) : [];
  if (exports.status === "rejected") console.warn("Sighting store exports unavailable; using verified directory.");
  if (approved.status === "rejected") console.warn("Approved sighting stores temporarily unavailable.");
  const bundled = ["locations", "stores"].flatMap(name => {
    const payload = readBundledSiteExport(name as "locations" | "stores");
    return [...(Array.isArray(payload?.locations) ? payload.locations : []), ...(Array.isArray(payload?.stores) ? payload.stores : [])];
  });
  const eligible = [...runtime, ...bundled].filter(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const store = normalizeSightingStore(value as Record<string, unknown>);
    // An old engine snapshot cannot resurrect a store absent from a complete
    // official directory. Owner-approved physical stores remain
    // a separate, deliberate addition below.
    return store && (!completeOfficialStates.has(store.state) || officialAddresses.has(sightingStoreAddressKey(store)));
  }) as Array<Record<string, unknown>>;
  const stores = mergeSightingStoreRows([
    ...(approved.status === "fulfilled" ? approved.value as unknown as Array<Record<string, unknown>> : []),
    ...reviewedRows, ...eligible,
  ]);
  const raw = Buffer.from(JSON.stringify(stores));
  const packed = brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:6}}).toString("base64");
  if (packed.length > 1_900_000) throw Error("Sighting store directory exceeds shared-cache bound");
  return packed;
}, ["sighting-store-directory-v1", SIGHTING_STORE_DIRECTORY_VERSION], {revalidate:300});

export async function readSightingStoreDirectory() {
  return (await memory.get(SIGHTING_STORE_DIRECTORY_VERSION, async () => {
    const packed = await readPackedDirectory();
    return JSON.parse(brotliDecompressSync(Buffer.from(packed,"base64"),{maxOutputLength:16*1024*1024}).toString("utf8")) as SightingStoreDirectoryEntry[];
  })).value;
}
