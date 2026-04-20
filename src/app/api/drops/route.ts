import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ENGINE_URL = "https://engine.bourbonsignal.com/drops";
const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_PATH = join(CACHE_DIR, "drops-latest.json");

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
    console.error("[api/drops] Failed to write cache:", err);
  }
}

export async function GET() {
  const cached = readCachedPayload();

  try {
    const res = await fetch(ENGINE_URL, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "bourbonsignal-web/1.0" },
    });

    if (!res.ok) {
      throw new Error(`Engine returned ${res.status}`);
    }

    const raw = await res.json();
    const data = normalizeDropsPayload(raw);

    if (Array.isArray(data.drops) && data.drops.length > 0) {
      writeCachedPayload(data);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
      });
    }

    if (cached?.drops?.length) {
      return NextResponse.json(
        {
          ...cached,
          fallback: true,
          error: "Fresh engine payload was empty, serving last known valid drops",
        },
        { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=300" } }
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=120" },
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
        { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=300" } }
      );
    }

    return NextResponse.json(
      {
        drops: [],
        total: 0,
        lastUpdated: new Date().toISOString(),
        error: "Feed temporarily unavailable",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
