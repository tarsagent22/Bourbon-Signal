import { createHmac, timingSafeEqual } from "node:crypto";
import { publicStateCode } from "./location-normalization.ts";

/** Public request/response scope; internal engine partition IDs remain internal. */
export function engineFeedVerificationState(state: string) {
  const code = publicStateCode(state);
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("Unsupported engine verification state.");
  return code;
}

export const ENGINE_FEED_VERIFICATION_HEADER = "x-bourbon-signal-engine-verification";
export const ENGINE_FEED_COUNT_CONTRACT = "bourbon-signal/engine-feed-count@1";
const PURPOSE = ENGINE_FEED_COUNT_CONTRACT;

function scopedUrl(url: URL) {
  const keys = [...url.searchParams.keys()];
  return url.pathname === "/api/drops"
    && keys.length === 3 && new Set(keys).size === 3
    && keys.every(key => ["state", "limit", "_bs_verify"].includes(key))
    && /^[A-Z]{2}$/.test(url.searchParams.get("state") || "")
    && url.searchParams.get("limit") === "1"
    && /^\d{13}-[a-f0-9]{1,16}$/.test(url.searchParams.get("_bs_verify") || "");
}

export function signEngineFeedVerification(url: URL, key: string, nowMs = Date.now()) {
  if (key.length < 32 || !scopedUrl(url) || !Number.isFinite(nowMs)) throw new Error("Engine count verification is not configured for this request.");
  const timestamp = Math.floor(nowMs / 1000);
  const signature = createHmac("sha256", key).update(`${PURPOSE}\nGET\n${url.origin}${url.pathname}${url.search}\n${timestamp}`).digest("hex");
  return `v1:${timestamp}:${signature}`;
}

export function authorizeEngineFeedVerification(url: URL, supplied: string | null, key: string, nowMs = Date.now()) {
  if (!supplied || key.length < 32 || !scopedUrl(url) || !Number.isFinite(nowMs)) return false;
  const match = /^v1:(\d{10}):([a-f0-9]{64})$/.exec(supplied);
  if (!match) return false;
  const age = Math.floor(nowMs / 1000) - Number(match[1]);
  if (age < -5 || age > 90) return false;
  const expected = signEngineFeedVerification(url, key, Number(match[1]) * 1000).split(":")[2];
  return timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(expected, "hex"));
}

export function engineFeedCountPayload(state: string, total: number, snapshot: string, lastUpdated: unknown) {
  return { contractVersion: PURPOSE, state: engineFeedVerificationState(state), total, snapshot, lastUpdated };
}
