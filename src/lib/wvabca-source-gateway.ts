import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as https from "node:https";
import { join } from "node:path";

const PAGE_URL = "https://www.wvabca.com/liquorsearch.aspx";
const API_BASE_URL = "https://api.wvabca.com/API.svc";
const MAX_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const CACHE_TTL_MS = 10 * 60_000;
const AUTH_LABEL = "bourbon-signal/wvabca-gateway@1";
const WATCHLIST = Object.freeze([
  Object.freeze({ query: "Buffalo Trace Kentucky Straight Bourbon Whiskey", expectedProductId: 827, bottleSize: 750 }),
  Object.freeze({ query: "Blanton's Gold Bourbon", expectedProductId: 10150, bottleSize: 750 }),
  Object.freeze({ query: "Booker's Bourbon", expectedProductId: 734, bottleSize: 750 }),
]);

const ca = readFileSync(join(process.cwd(), "engine", "data", "certificates", "wvabca-rapidssl-chain.pem"), "utf8");
const agent = new https.Agent({ ca, family: 4, minVersion: "TLSv1.2", maxVersion: "TLSv1.2", keepAlive: true, maxSockets: 1 });

type UpstreamResponse = { status: number; text: string; setCookie: string };
type ProductRow = { ProductID?: unknown; ProductName?: unknown; BottleSize?: unknown; [key: string]: unknown };
type StoreRow = { StoreNumber?: unknown; [key: string]: unknown };
export type WvabcaGatewayPayload = {
  contractVersion: "bourbon-signal/wvabca-gateway@1";
  observedAt: string;
  requestCount: 9;
  canaryStoreCount: number;
  endingCanaryStoreCount: number;
  products: Array<{
    expectedProductId: number;
    bottleSize: number;
    product: ProductRow;
    stores: StoreRow[];
  }>;
};

export function authorizeWvabcaGateway(authorization: string | null) {
  const key = process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || "";
  if (!key) return "unconfigured" as const;
  const actual = /^Bearer\s+([a-f0-9]{64})$/i.exec(String(authorization || "").trim())?.[1] || "";
  const expected = createHmac("sha256", key).update(AUTH_LABEL).digest("hex");
  if (!actual) return "unauthorized" as const;
  const actualBuffer = Buffer.from(actual, "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  return timingSafeEqual(actualBuffer, expectedBuffer) ? "authorized" as const : "unauthorized" as const;
}

function boundedText(url: string, method = "GET", body?: string, cookie = ""): Promise<UpstreamResponse> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["www.wvabca.com", "api.wvabca.com"].includes(parsed.hostname)) {
    throw new Error("WVABCA gateway upstream host is not allowlisted.");
  }
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      accept: method === "POST" ? "application/json, text/javascript, */*;q=0.1" : "text/html,*/*;q=0.1",
      "accept-language": "en-US,en;q=0.8",
      "user-agent": "BourbonSignalWvabcaGateway/1.0 (+https://www.bourbonsignal.com/coverage)",
    };
    if (method === "POST") {
      headers["content-type"] = "application/json; charset=utf-8";
      headers.origin = "https://www.wvabca.com";
      headers.referer = PAGE_URL;
    }
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));

    const request = https.request(parsed, { method, headers, agent, family: 4, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          response.destroy(new Error("WVABCA gateway upstream response exceeded the byte limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const status = Number(response.statusCode || 0);
        const text = Buffer.concat(chunks).toString("utf8");
        const setCookie = (response.headers["set-cookie"] || []).map((value) => String(value).split(";", 1)[0]).filter(Boolean).join("; ");
        if (status < 200 || status >= 300) {
          reject(new Error(`WVABCA gateway upstream returned HTTP ${status}.`));
          return;
        }
        resolve({ status, text, setCookie });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

export function mergeWvabcaCookieHeader(current: string, incoming: string) {
  const cookies = new Map<string, string>();
  for (const header of [current, incoming]) {
    for (const item of String(header || "").split(/;\s*/).filter(Boolean)) {
      const separator = item.indexOf("=");
      if (separator <= 0) continue;
      const name = item.slice(0, separator).trim();
      if (name) cookies.set(name, item.trim());
    }
  }
  return Array.from(cookies.values()).join("; ");
}

export function parseWvabcaGatewayArray(text: string, label: string): Array<Record<string, unknown>> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(`${label} returned malformed JSON.`); }
  if (!Array.isArray(value)) throw new Error(`${label} did not return an array.`);
  if (!value.every((row) => Boolean(row) && typeof row === "object" && !Array.isArray(row))) {
    throw new Error(`${label} contained a malformed row.`);
  }
  return value as Array<Record<string, unknown>>;
}

function bottleSizes(value: unknown) {
  return String(value ?? "").split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
}

function productForWatch(rows: Array<Record<string, unknown>>, watch: (typeof WATCHLIST)[number]) {
  return rows.find((row) => Number(row.ProductID) === watch.expectedProductId && bottleSizes(row.BottleSize).includes(watch.bottleSize)) || null;
}

export function requireValidWvabcaProductRows(rows: Array<Record<string, unknown>>) {
  if (!rows.every((row) => Number.isInteger(Number(row.ProductID)) && Number(row.ProductID) > 0
    && String(row.ProductName || "").trim().length > 0
    && bottleSizes(row.BottleSize).some((size) => Number.isFinite(size) && size > 0))) {
    throw new Error("WVABCA gateway catalog response contained an invalid product identity.");
  }
  return rows;
}

export function requireValidWvabcaStoreRows(rows: Array<Record<string, unknown>>, {
  expectedProductId,
  bottleSize,
}: { expectedProductId: number; bottleSize: number }) {
  const seen = new Set<number>();
  for (const row of rows) {
    const storeNumber = Number(row.StoreNumber);
    if (!Number.isInteger(storeNumber) || storeNumber <= 0 || seen.has(storeNumber)
      || Number(row.ProductID) !== expectedProductId || Number(row.BottleSize) !== bottleSize
      || !String(row.StoreName || "").trim() || !String(row.StreetAddress1 || "").trim()
      || !String(row.City || "").trim() || !String(row.ProductName || "").trim()) {
      throw new Error("WVABCA gateway retailer response contained an invalid, duplicate, or unbound store identity.");
    }
    seen.add(storeNumber);
  }
  return rows as StoreRow[];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function collectWvabcaGatewayPayload(): Promise<WvabcaGatewayPayload> {
  let requestCount = 0;
  const page = await boundedText(PAGE_URL);
  requestCount += 1;
  const key = /\bvar\s+APIKey\s*=\s*(["'])([^"'\s]{4,512})\1\s*;/.exec(page.text)?.[2];
  if (!key) throw new Error("WVABCA gateway page did not expose the public runtime key.");
  let cookie = page.setCookie;
  const apiPost = async (method: "GetProductNameSearch" | "GetStoresWithProduct", payload: Record<string, unknown>) => {
    if (requestCount > 1) await wait(500);
    const response = await boundedText(`${API_BASE_URL}/${method}`, "POST", JSON.stringify({ APIKey: key, ...payload }), cookie);
    requestCount += 1;
    cookie = mergeWvabcaCookieHeader(cookie, response.setCookie);
    return parseWvabcaGatewayArray(response.text, `WVABCA gateway ${method}`);
  };
  const search = async (watch: (typeof WATCHLIST)[number]) => {
    const rows = requireValidWvabcaProductRows(await apiPost("GetProductNameSearch", { ProductName: watch.query, NewProduct: false }));
    const product = productForWatch(rows, watch);
    if (!product) throw new Error(`WVABCA gateway product ${watch.expectedProductId} was missing.`);
    return product as ProductRow;
  };
  const stores = async (product: ProductRow, watch: (typeof WATCHLIST)[number]) => requireValidWvabcaStoreRows(await apiPost("GetStoresWithProduct", {
    productID: Number(product.ProductID), bottleSize: watch.bottleSize,
  }), { expectedProductId: Number(product.ProductID), bottleSize: watch.bottleSize });

  const canary = WATCHLIST[0];
  const startingProduct = await search(canary);
  const startingStores = await stores(startingProduct, canary);
  if (startingStores.length < 20) throw new Error("WVABCA gateway starting canary collapsed.");

  const products: WvabcaGatewayPayload["products"] = [{
    expectedProductId: canary.expectedProductId,
    bottleSize: canary.bottleSize,
    product: startingProduct,
    stores: startingStores,
  }];
  for (const watch of WATCHLIST.slice(1)) {
    const product = await search(watch);
    const productStores = await stores(product, watch);
    if (!productStores.length) throw new Error(`WVABCA gateway product ${watch.expectedProductId} returned no stores.`);
    products.push({ expectedProductId: watch.expectedProductId, bottleSize: watch.bottleSize, product, stores: productStores });
  }

  const endingProduct = await search(canary);
  const endingStores = await stores(endingProduct, canary);
  if (endingStores.length < 20 || endingStores.length < Math.ceil(startingStores.length * 0.8)) {
    throw new Error("WVABCA gateway ending canary collapsed.");
  }
  if (requestCount !== 9) throw new Error(`WVABCA gateway request budget drifted to ${requestCount}.`);

  return {
    contractVersion: "bourbon-signal/wvabca-gateway@1",
    observedAt: new Date().toISOString(),
    requestCount: 9,
    canaryStoreCount: startingStores.length,
    endingCanaryStoreCount: endingStores.length,
    products,
  };
}

let memo: { expiresAt: number; value: WvabcaGatewayPayload } | null = null;
let inFlight: Promise<WvabcaGatewayPayload> | null = null;

export async function readCachedWvabcaGatewayPayload() {
  if (memo && memo.expiresAt > Date.now()) return memo.value;
  if (!inFlight) {
    inFlight = collectWvabcaGatewayPayload()
      .then((value) => {
        memo = { expiresAt: Date.now() + CACHE_TTL_MS, value };
        return value;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}
