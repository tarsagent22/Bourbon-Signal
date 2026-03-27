import { NextResponse } from "next/server";

const ENGINE_URL = "https://engine.proofhunt.co/stats";

export async function GET() {
  try {
    const res = await fetch(ENGINE_URL, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "proofhunt-web/1.0" },
    });

    if (!res.ok) {
      throw new Error(`Engine returned ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("[api/stats] Error fetching from engine:", err);
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
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
