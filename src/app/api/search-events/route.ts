import { NextResponse } from "next/server";
import { captureSearchEvent } from "@/lib/search-capture";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  captureSearchEvent({
    surface: body.surface === "bottle-check" ? "bottle-check" : "finder",
    query: typeof body.query === "string" ? body.query : "",
    state: typeof body.state === "string" ? body.state : undefined,
    mode: typeof body.mode === "string" ? body.mode : undefined,
    outcome: body.outcome === "selected" || body.outcome === "suggested" || body.outcome === "matched" || body.outcome === "unmatched" ? body.outcome : "submitted",
    matchedBottleId: typeof body.matchedBottleId === "string" ? body.matchedBottleId : null,
    matchedBottleName: typeof body.matchedBottleName === "string" ? body.matchedBottleName : null,
    suggestionCount: typeof body.suggestionCount === "number" ? body.suggestionCount : undefined,
    resultCount: typeof body.resultCount === "number" ? body.resultCount : undefined,
  });

  return NextResponse.json({ ok: true });
}
