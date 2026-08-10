import { NextRequest, NextResponse } from "next/server";

import { authorizeWvabcaGateway, readCachedWvabcaGatewayPayload } from "@/lib/wvabca-source-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_CONTROL = "private, no-store";

export async function GET(request: NextRequest) {
  if (request.nextUrl.search) {
    return NextResponse.json({ error: "This fixed-source endpoint accepts no parameters." }, {
      status: 400,
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  }
  const authorization = authorizeWvabcaGateway(request.headers.get("authorization"));
  if (authorization !== "authorized") {
    return NextResponse.json({ error: authorization === "unconfigured" ? "Gateway credential is not configured." : "Unauthorized" }, {
      status: authorization === "unconfigured" ? 503 : 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const payload = await readCachedWvabcaGatewayPayload();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "X-Bourbon-Signal-Source": "wvabca-fixed-gateway",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WVABCA gateway failed.";
    return NextResponse.json({ error: message }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
