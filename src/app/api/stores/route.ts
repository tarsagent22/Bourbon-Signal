import { NextResponse } from "next/server";

const ENGINE_URL = "https://engine.bourbonsignal.com/stores";

export async function GET() {
  try {
    const res = await fetch(ENGINE_URL, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "casksignal-web/1.0" },
    });

    if (!res.ok) {
      throw new Error(`Engine returned ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("[api/stores] Error fetching from engine:", err);
    return NextResponse.json(
      {
        stores: [],
        total: 0,
        states: [],
        error: "Feed temporarily unavailable",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
