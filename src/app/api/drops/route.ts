import { NextResponse } from "next/server";
import { join } from "path";
import { readFileSync } from "fs";

export async function GET() {
  try {
    // Data is bundled at deploy time from proof-engine/data/events.jsonl
    // See scripts/deploy.sh for the pre-build copy step
    const dataPath = join(process.cwd(), "src", "data", "drops.json");
    const raw = readFileSync(dataPath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
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
