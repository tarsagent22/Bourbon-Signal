import { buildReleaseRadarIcs } from "@/lib/release-radar-ics";
import { radarEntries } from "@/lib/release-radar";

export const dynamic = "force-static";

export function GET() {
  const body = buildReleaseRadarIcs(radarEntries, { origin: "https://www.bourbonsignal.com" });
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Disposition": 'attachment; filename="bourbon-signal-release-radar.ics"',
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}
