import { NextResponse } from "next/server";

const ENGINE_URL = "https://engine.proofhunt.co/stores";

export async function GET() {
  try {
    const res = await fetch(ENGINE_URL, {
      cache: "no-store",
      headers: { "User-Agent": "proofhunt-web/1.0" },
    });

    if (!res.ok) {
      throw new Error(`Engine returned ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
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
