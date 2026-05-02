import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ENGINE_URL = "https://engine.bourbonsignal.com/stats";
const CACHE_DIR = join(process.cwd(), ".cache", "api");
const CACHE_PATH = join(CACHE_DIR, "stats.json");
const FETCH_TIMEOUT_MS = 8000;

function readCachedPayload() {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function writeCachedPayload(data: Record<string, unknown>) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(data));
  } catch (err) {
    console.error("[api/stats] Failed to write cache:", err);
  }
}

export async function GET() {
  const cached = readCachedPayload();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(ENGINE_URL, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "casksignal-web/1.0" },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Engine returned ${res.status}`);
    }

    const data = await res.json();

    const statesCoveredCount = Array.isArray(data.states_covered)
      ? data.states_covered.length
      : Number(data.states_covered ?? 0);

    if ((data.total_bottles ?? 0) > 0 || (data.total_stores ?? 0) > 0 || statesCoveredCount > 0) {
      writeCachedPayload(data);
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
          "X-Api-Source": "engine",
        },
      });
    }

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
          "X-Api-Source": "cache-fallback",
        },
      });
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=120",
        "X-Api-Source": "engine-empty",
      },
    });
  } catch (err) {
    console.error("[api/stats] Error fetching from engine:", err);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
          "X-Api-Source": "cache-fallback",
        },
      });
    }

    return NextResponse.json(
      {
        total_bottles: 0,
        total_stores: 0,
        states_covered: 0,
        drops_today: 0,
        drops_this_week: 0,
        unicorn_count: 0,
        allocated_count: 0,
        by_state: {},
        error: "Feed temporarily unavailable",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
          "X-Api-Source": "empty-fallback",
        },
      }
    );
  }
}
