"use client";

import { CalendarPlus } from "lucide-react";
import { trackRadarGrowthEvent } from "@/lib/radar-analytics";

export function RadarCalendarDownload() {
  return <a
    href="/release-radar/calendar.ics"
    onClick={() => trackRadarGrowthEvent("radar_calendar_exported", {
      surface: "release_radar",
      precision: "exact",
    })}
  >
    <CalendarPlus size={14} aria-hidden /> Add precise dates
  </a>;
}
