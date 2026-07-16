import { NextResponse } from "next/server";
import { getBottleById } from "@/lib/bourbonBible";
import { captureSearchEvent } from "@/lib/search-capture";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedBottleId = typeof body.canonicalBottleId === "string"
    ? body.canonicalBottleId
    : typeof body.matchedBottleId === "string" ? body.matchedBottleId : "";
  const canonicalBottle = requestedBottleId ? await getBottleById(requestedBottleId) : null;

  captureSearchEvent({
    surface: body.surface === "bottle-check" ? "bottle-check" : "finder",
    state: typeof body.state === "string" ? body.state : undefined,
    outcome: body.outcome === "selected" || body.outcome === "suggested" || body.outcome === "matched" || body.outcome === "unmatched" ? body.outcome : "submitted",
    canonicalBottleId: canonicalBottle?.id,
    suggestionCount: typeof body.suggestionCount === "number" ? body.suggestionCount : undefined,
    resultCount: typeof body.resultCount === "number" ? body.resultCount : undefined,
  });

  return NextResponse.json({ ok: true });
}
