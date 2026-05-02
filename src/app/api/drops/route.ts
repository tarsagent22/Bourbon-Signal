import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ENGINE_URL = "https://engine.bourbonsignal.com/drops";
const CACHE_DIR = join(process.cwd(), ".cache", "drops");
const DEFAULT_CACHE_PATH = join(CACHE_DIR, "default.json");
const FETCH_TIMEOUT_MS = 8000;

function normalizeDropsPayload(data: Record<string, unknown>) {
  const STATE_MAP: Record<string, string> = {
    Pennsylvania: "PA",
    "North Carolina": "NC",
    Virginia: "VA",
    Indiana: "IN",
    Utah: "UT",
    Texas: "TX",
    Ohio: "OH",
  };

  const drops = Array.isArray(data.drops)
    ? data.drops.map((d: Record<string, unknown>) => ({
        ...d,
        state: STATE_MAP[d.state as string] ?? d.state_code ?? d.state,
      }))
    : [];

  return {
    ...data,
    drops,
    total: typeof data.total === "number" ? data.total : drops.length,
    lastUpdated: typeof data.lastUpdated === "string" ? data.lastUpdated : new Date().toISOString(),
  };
}

function getCachePath(cacheKey: string) {
  const digest = createHash("sha1").update(cacheKey).digest("hex");
  return join(CACHE_DIR, `${digest}.json`);
}

function readCachedPayload(cacheKey: string) {
  const paths = [getCachePath(cacheKey), DEFAULT_CACHE_PATH];
  for (const filePath of paths) {
    try {
      if (!existsSync(filePath)) continue;
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      continue;
    }
  }
  return null;
}

function writeCachedPayload(cacheKey: string, data: Record<string, unknown>) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(getCachePath(cacheKey), JSON.stringify(data));
    if (cacheKey === "all__50__0____") {
      writeFileSync(DEFAULT_CACHE_PATH, JSON.stringify(data));
    }
  } catch (err) {
    console.error("[api/drops] Failed to write cache:", err);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const bottle = url.searchParams.get("bottle");
  const store = url.searchParams.get("store");
  const cacheKey = [state || "all", limit || "50", offset || "0", bottle || "", store || ""].join("__");
  const shouldUseDefaultCache = !state && !bottle && !store && (!limit || limit === "50") && (!offset || offset === "0");
  const cached = readCachedPayload(cacheKey);

  try {
    const engineUrl = new URL(ENGINE_URL);
    if (state) engineUrl.searchParams.set("state", state);
    if (limit) engineUrl.searchParams.set("limit", limit);
    if (offset) engineUrl.searchParams.set("offset", offset);
    if (bottle) engineUrl.searchParams.set("bottle", bottle);
    if (store) engineUrl.searchParams.set("store", store);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(engineUrl.toString(), {
      next: { revalidate: 60 },
      headers: { "User-Agent": "bourbonsignal-web/1.0" },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Engine returned ${res.status}`);
    }

    const raw = await res.json();
    const data = normalizeDropsPayload(raw);

    if (Array.isArray(data.drops) && data.drops.length > 0) {
      writeCachedPayload(cacheKey, data);
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
          "X-Drops-Cache-Key": cacheKey,
          "X-Drops-Source": "engine",
        },
      });
    }

    if (cached?.drops?.length) {
      return NextResponse.json(
        {
          ...cached,
          fallback: true,
          error: "Fresh engine payload was empty, serving last known valid drops",
        },
        {
          headers: {
            "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
            "X-Drops-Cache-Key": cacheKey,
            "X-Drops-Source": shouldUseDefaultCache ? "default-cache-fallback" : "query-cache-fallback",
          },
        }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=120",
        "X-Drops-Cache-Key": cacheKey,
        "X-Drops-Source": "engine-empty",
      },
    });
  } catch (err) {
    console.error("[api/drops] Error fetching from engine:", err);

    if (cached?.drops?.length) {
      return NextResponse.json(
        {
          ...cached,
          fallback: true,
          error: "Feed temporarily unavailable, serving last known valid drops",
        },
        {
          headers: {
            "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
            "X-Drops-Cache-Key": cacheKey,
            "X-Drops-Source": shouldUseDefaultCache ? "default-cache-fallback" : "query-cache-fallback",
          },
        }
      );
    }

    return NextResponse.json(
      {
        drops: [],
        total: 0,
        lastUpdated: new Date().toISOString(),
        error: "Feed temporarily unavailable",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
          "X-Drops-Cache-Key": cacheKey,
          "X-Drops-Source": "empty-fallback",
        },
      }
    );
  }
}
