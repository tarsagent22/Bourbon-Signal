import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const EVENTS_PATH = join(
  process.env.HOME || "/home/tarsagent",
  ".openclaw/workspace/proof-engine/data/events.jsonl"
);

const ALLOWED_TYPES = new Set([
  "new_shipment",
  "in_store",
  "allocation_assigned",
  "store_stock_increase",
]);

const ALLOWED_RARITIES = new Set(["allocated", "limited", "unicorn"]);

export async function GET() {
  try {
    const raw = readFileSync(EVENTS_PATH, "utf-8");
    const lines = raw.trim().split("\n");

    const events: Record<string, unknown>[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (
          ALLOWED_TYPES.has(obj.event_type) &&
          ALLOWED_RARITIES.has(obj.rarity_tier)
        ) {
          events.push(obj);
        }
      } catch {
        // skip malformed lines
      }
    }

    events.sort(
      (a, b) =>
        new Date(b.timestamp as string).getTime() -
        new Date(a.timestamp as string).getTime()
    );

    const drops = events.slice(0, 20);
    const lastUpdated =
      drops.length > 0 ? (drops[0].timestamp as string) : new Date().toISOString();

    return NextResponse.json(
      { drops, total: events.length, lastUpdated },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { drops: [], total: 0, lastUpdated: new Date().toISOString(), error: "Failed to read events" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
