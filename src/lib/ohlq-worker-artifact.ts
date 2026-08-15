import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const OHLQ_WORKER_CONTRACT = "bourbon-signal/ohlq-worker-artifact@1";
export const OHLQ_WORKER_MAX_BODY_BYTES = 4 * 1024 * 1024;
export const OHLQ_WORKER_MAX_AGE_MS = 20 * 60_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const MIN_OK_PRODUCTS = 10;
const MIN_INVENTORY_ROWS = 500;
const MAX_PRODUCTS = 100;
const MAX_ROWS_PER_PRODUCT = 2_000;

const PRODUCT_KEYS = [
  "ok", "status", "endpoint", "pageUrl", "title", "productName", "sku", "baseSku",
  "preferredVariantSku", "isExclusive", "displayStatus", "inventoryCount", "inventories",
] as const;
const INVENTORY_KEYS = [
  "AgencyId", "AgencyName", "VariantCode", "LocationTypes", "DeliveryAvailable", "PickupAvailable",
  "Latitude", "Longitude", "Address1", "Address2", "City", "State", "Zip", "I", "Distance",
  "LastModified", "PhoneNumber", "EcommerceUrls", "Url", "Price", "LimitOne",
] as const;
const FORBIDDEN_KEY = /^(?:authorization|cookie|cookies|csrf|csrfToken|headers|profileDir|requestVerificationToken|storageState|token)$/i;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, label: string, maximum = 500, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function assertNoSensitiveKeys(value: unknown, path = "artifact") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertNoSensitiveKeys(value[index], `${path}[${index}]`);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key) || /(?:session|secret)/i.test(key)) throw new Error(`${path}.${key} is forbidden.`);
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

function ohlqUrl(value: unknown, label: string) {
  const normalized = boundedString(value, label, 1_000, true)!;
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.ohlq.com" || parsed.username || parsed.password) {
    throw new Error(`${label} must use the canonical OHLQ origin.`);
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function availabilityEndpoint(value: unknown, label: string, required: boolean) {
  const normalized = boundedString(value, label, 1_000, required);
  if (!normalized) return null;
  const parsed = new URL(normalized, "https://www.ohlq.com");
  if (parsed.origin !== "https://www.ohlq.com" || !parsed.pathname.startsWith("/api/product-availability/")) {
    throw new Error("Unexpected OHLQ availability endpoint.");
  }
  const seen = new Set<string>();
  for (const [key, parameterValue] of parsed.searchParams.entries()) {
    if (!["isExclusive", "sortByAvailability", "sku"].includes(key) || seen.has(key)) throw new Error("Unexpected OHLQ availability query parameter.");
    seen.add(key);
    if (key === "sku" && !/^[a-z0-9-]{1,64}$/i.test(parameterValue)) throw new Error("Invalid OHLQ availability SKU.");
    if (key !== "sku" && !/^(?:true|false)$/i.test(parameterValue)) throw new Error("Invalid OHLQ availability flag.");
  }
  return `${parsed.pathname}${parsed.search}`;
}

function optionalScalar(value: unknown, label: string) {
  if (value == null || typeof value === "boolean") return value ?? null;
  if (typeof value === "number") return finiteNumber(value, label, -1_000_000_000, 1_000_000_000);
  return boundedString(value, label, 1_000);
}

function sanitizeInventory(value: unknown, productIndex: number, rowIndex: number) {
  const input = record(value, `products[${productIndex}].inventories[${rowIndex}]`);
  const output: Record<string, unknown> = {};
  for (const key of INVENTORY_KEYS) {
    if (!(key in input)) continue;
    if (key === "State") {
      const state = boundedString(input[key], `${key}`, 2, true)!.toUpperCase();
      if (state !== "OH") throw new Error("OHLQ inventory row is outside Ohio.");
      output[key] = state;
    } else if (key === "EcommerceUrls") {
      if (!Array.isArray(input[key]) || input[key].length > 20) throw new Error(`${key} is invalid.`);
      output[key] = input[key].map((entry, index) => ohlqUrl(entry, `${key}[${index}]`));
    } else if (key === "LocationTypes") {
      if (!Array.isArray(input[key]) || input[key].length > 20) throw new Error(`${key} is invalid.`);
      output[key] = input[key].map((entry, index) => boundedString(entry, `${key}[${index}]`, 100, true));
    } else if (key === "Url") {
      output[key] = ohlqUrl(input[key], key);
    } else if (key === "DeliveryAvailable" || key === "PickupAvailable" || key === "LimitOne") {
      if (typeof input[key] !== "boolean") throw new Error(`${key} must be boolean.`);
      output[key] = input[key];
    } else {
      output[key] = optionalScalar(input[key], `products[${productIndex}].inventories[${rowIndex}].${key}`);
    }
  }
  for (const required of ["AgencyId", "AgencyName", "Address1", "City", "State", "Zip", "I"] as const) {
    if (output[required] == null || output[required] === "") throw new Error(`OHLQ inventory row is missing ${required}.`);
  }
  return output;
}

function sanitizeProduct(value: unknown, index: number) {
  const input = record(value, `products[${index}]`);
  const inputInventories = input.inventories ?? [];
  if (!Array.isArray(inputInventories) || inputInventories.length > MAX_ROWS_PER_PRODUCT) {
    throw new Error(`products[${index}].inventories is invalid.`);
  }
  const ok = input.ok === true;
  const status = finiteNumber(input.status, `products[${index}].status`, 0, 599);
  if (ok && status !== 200) throw new Error(`products[${index}] claims success without HTTP 200.`);
  const inventories = inputInventories.map((row, rowIndex) => sanitizeInventory(row, index, rowIndex));
  if (ok && inventories.length === 0) throw new Error(`products[${index}] claims success without inventory rows.`);
  const output: Record<string, unknown> = {};
  for (const key of PRODUCT_KEYS) {
    if (key === "inventories" || key === "inventoryCount" || !(key in input)) continue;
    if (key === "pageUrl") output[key] = ohlqUrl(input[key], `products[${index}].pageUrl`);
    else if (key === "endpoint") output[key] = availabilityEndpoint(input[key], `products[${index}].endpoint`, ok);
    else if (key === "ok") output[key] = ok;
    else if (key === "isExclusive") {
      if (typeof input[key] !== "boolean") throw new Error(`products[${index}].isExclusive must be boolean.`);
      output[key] = input[key];
    }
    else if (key === "status") output[key] = status;
    else if (["title", "productName", "sku", "baseSku", "preferredVariantSku", "displayStatus"].includes(key)) {
      output[key] = boundedString(input[key], `products[${index}].${key}`, 500, ok && ["productName", "sku"].includes(key));
    } else output[key] = optionalScalar(input[key], `products[${index}].${key}`);
  }
  if (!("pageUrl" in input)) throw new Error(`products[${index}] is missing pageUrl.`);
  if (ok && (!output.endpoint || !output.productName || !output.sku)) throw new Error(`products[${index}] is missing successful product identity.`);
  const inventoryCount = input.inventoryCount == null
    ? inventories.length
    : finiteNumber(input.inventoryCount, `products[${index}].inventoryCount`, 0, 1_000_000);
  if (inventoryCount !== inventories.length) throw new Error(`products[${index}] inventory count does not match its rows.`);
  output.inventoryCount = inventoryCount;
  output.inventories = inventories;
  return output;
}

export function sanitizeOhlqWorkerEnvelope(value: unknown, options: { now?: number; maximumAgeMs?: number } = {}) {
  const input = record(value, "request body");
  if (input.contractVersion !== OHLQ_WORKER_CONTRACT) throw new Error("Unsupported OHLQ worker artifact contract.");
  const uploadId = boundedString(input.uploadId, "uploadId", 36, true)!;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) throw new Error("uploadId must be a UUID v4.");
  if (input.cooldown != null) throw new Error("A blocked/cooldown OHLQ artifact cannot be accepted.");
  assertNoSensitiveKeys(input);
  const artifactInput = record(input.artifact, "artifact");
  if (artifactInput.cooldown != null) throw new Error("A blocked/cooldown OHLQ artifact cannot be accepted.");
  const generatedAt = boundedString(input.generatedAt, "generatedAt", 40, true)!;
  if (artifactInput.generatedAt !== generatedAt) throw new Error("Envelope and artifact timestamps do not match.");
  const generatedAtMs = Date.parse(generatedAt);
  const now = options.now ?? Date.now();
  const maximumAgeMs = options.maximumAgeMs ?? OHLQ_WORKER_MAX_AGE_MS;
  if (!Number.isFinite(generatedAtMs) || generatedAtMs > now + MAX_CLOCK_SKEW_MS || now - generatedAtMs > maximumAgeMs) {
    throw new Error("OHLQ worker artifact is stale or future-dated.");
  }
  if (!Array.isArray(artifactInput.products) || artifactInput.products.length < MIN_OK_PRODUCTS || artifactInput.products.length > MAX_PRODUCTS) {
    throw new Error("OHLQ worker product set is outside the accepted bounds.");
  }
  const products = artifactInput.products.map(sanitizeProduct);
  const summaryInput = record(artifactInput.summary, "artifact.summary");
  const productCount = finiteNumber(summaryInput.productCount, "summary.productCount", 0, MAX_PRODUCTS);
  const okProductCount = finiteNumber(summaryInput.okProductCount, "summary.okProductCount", 0, MAX_PRODUCTS);
  const inventoryRowCount = finiteNumber(summaryInput.inventoryRowCount, "summary.inventoryRowCount", 0, MAX_PRODUCTS * MAX_ROWS_PER_PRODUCT);
  const observedOk = products.filter((product) => product.ok === true).length;
  const observedRows = products.reduce((sum, product) => sum + (product.inventories as unknown[]).length, 0);
  if (productCount !== products.length || okProductCount !== observedOk || inventoryRowCount !== observedRows) {
    throw new Error("OHLQ worker summary does not match its product rows.");
  }
  if (okProductCount < MIN_OK_PRODUCTS || okProductCount / productCount < 0.5 || inventoryRowCount < MIN_INVENTORY_ROWS) {
    throw new Error("OHLQ worker artifact does not meet the minimum complete-collection threshold.");
  }
  return {
    contractVersion: OHLQ_WORKER_CONTRACT,
    uploadId,
    generatedAt,
    artifact: {
      generatedAt,
      products,
      summary: { productCount, okProductCount, inventoryRowCount },
    },
  };
}

export function ohlqWorkerArtifactDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function ohlqWorkerSignature(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}\n${body}`).digest("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getOhlqWorkerArtifactSecret(env: NodeJS.ProcessEnv = process.env) {
  if (typeof env.OHLQ_WORKER_ARTIFACT_SECRET === "string" && env.OHLQ_WORKER_ARTIFACT_SECRET.length >= 32) return env.OHLQ_WORKER_ARTIFACT_SECRET;
  if (typeof env.CRON_SECRET !== "string" || env.CRON_SECRET.length < 32) return undefined;
  return createHmac("sha256", env.CRON_SECRET).update("bourbon-signal/ohlq-worker-capability@1").digest("base64url");
}

export function authorizeOhlqWorkerBearer(header: string | null, secret = getOhlqWorkerArtifactSecret()) {
  return Boolean(secret && secret.length >= 32 && header?.startsWith("Bearer ") && constantTimeEqual(header.slice(7), secret));
}

export function verifyOhlqWorkerUploadSignature(input: { body: string; timestamp: string | null; signature: string | null; secret?: string; now?: number }) {
  const secret = input.secret ?? getOhlqWorkerArtifactSecret();
  if (!secret || secret.length < 32 || !input.timestamp || !input.signature) return false;
  const timestampMs = Date.parse(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  return constantTimeEqual(input.signature, ohlqWorkerSignature(secret, input.timestamp, input.body));
}
