import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

export async function GET() {
  try {
    const exportPayload = readSiteExport("nc-intelligence");
    return NextResponse.json(exportPayload ?? { boards: [], coverage: null }, {
      headers: {
        ...siteExportHeaders("local-export"),
        "X-NC-Intelligence-Source": "local-export",
      },
    });
  } catch (err) {
    console.error("[api/nc-intelligence] Error reading site export:", err);
    return NextResponse.json(
      {
        boards: [],
        coverage: null,
        error: "NC intelligence export temporarily unavailable",
      },
      {
        status: 200,
        headers: {
          ...siteExportHeaders("empty-fallback"),
          "X-NC-Intelligence-Source": "empty-fallback",
        },
      }
    );
  }
}
