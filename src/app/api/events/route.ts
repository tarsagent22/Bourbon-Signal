import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

type JsonRecord = Record<string, unknown>;

function includesNeedle(value: unknown, needle: string) {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function eventDateValue(event: JsonRecord) {
  const value = asString(event.eventDate) || asString(event.observedAt) || asString(event.timestamp);
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function eventRank(event: JsonRecord) {
  const score = Number(event.sortScore || 0);
  const actionability = asString(event.actionability);
  const boost = actionability === "high" ? 1000 : actionability === "medium" ? 500 : 0;
  return boost + (Number.isFinite(score) ? score : 0) + eventDateValue(event) / 100000000000;
}

function isUpcomingActionableEvent(event: ReturnType<typeof normalizeEvent>) {
  const status = String(event.event_status || "").toLowerCase();
  const actionability = String(event.actionability || "").toLowerCase();
  const category = String(event.category || "").toLowerCase();
  const eventDate = Date.parse(String(event.event_date || ""));
  const hasFutureDate = Number.isFinite(eventDate) && eventDate >= Date.now() - 24 * 60 * 60 * 1000;
  const hasOfficialLink = typeof event.source_url === "string" && /^https?:\/\//i.test(event.source_url);
  const isSourceWatchPage = status === "watch_page" || category === "release_watch" || !event.event_date;
  return hasOfficialLink && hasFutureDate && !isSourceWatchPage && ["high", "medium"].includes(actionability);
}

function normalizeEvent(event: JsonRecord) {
  const category = asString(event.category, "release_watch");
  const state = asString(event.state);
  const bottleName = asString(event.bottleName, asString(event.canonicalName, asString(event.rawName, "Release watch")));
  const locationName = asString(event.locationName, asString(event.storeName, state));
  return {
    ...event,
    id: asString(event.eventId, asString(event.id)),
    title: asString(event.title) || `${bottleName} — ${category.replace(/_/g, " ")}`,
    state,
    category,
    bottle_name: bottleName,
    canonical_name: asString(event.canonicalName, bottleName),
    raw_name: asString(event.rawName),
    source: asString(event.source),
    source_url: asString(event.sourceUrl),
    location_name: locationName,
    store_name: asString(event.storeName),
    store_address: asString(event.storeAddress),
    city: asString(event.city),
    county: asString(event.county),
    event_date: asString(event.eventDate),
    event_time: asString(event.eventTime),
    observed_at: asString(event.observedAt),
    source_type: asString(event.sourceType, "release_watch"),
    source_type_label: asString(event.sourceTypeLabel, "Release-watch source"),
    event_status: asString(event.eventStatus, asString(event.eventDate) ? "scheduled_future" : "watch_page"),
    actionability: asString(event.actionability, "watch"),
    detected_products: asStringArray(event.detectedProducts),
    content_signature: asString(event.contentSignature),
    sort_score: Number(event.sortScore || 0),
    label: asString(event.actionLabel),
    caveat: asString(event.inventoryCaveat, "Release/event intelligence only; verify rules at the source."),
    is_inventory: event.canAlertAsInventory === true,
    is_watch: event.canAlertAsWatch === true,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  const category = url.searchParams.get("category")?.toLowerCase().trim();
  const q = url.searchParams.get("q")?.toLowerCase().trim();
  const status = url.searchParams.get("status")?.toLowerCase().trim();
  const actionable = url.searchParams.get("actionable")?.toLowerCase().trim();
  const limit = Math.max(0, Number(url.searchParams.get("limit") ?? "100") || 100);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);

  try {
    const exportPayload = readSiteExport("events");
    const rawEvents = Array.isArray(exportPayload?.events) ? exportPayload.events : [];
    let events = rawEvents.map((event) => normalizeEvent(event as JsonRecord));
    events = events.filter(isUpcomingActionableEvent);
    const facets = {
      states: Array.from(new Set(events.map((event) => String(event.state || "")).filter(Boolean))).sort(),
      categories: Array.from(new Set(events.map((event) => String(event.category || "")).filter(Boolean))).sort(),
      statuses: Array.from(new Set(events.map((event) => String(event.event_status || "")).filter(Boolean))).sort(),
      actionability: Array.from(new Set(events.map((event) => String(event.actionability || "")).filter(Boolean))).sort(),
    };

    if (state) events = events.filter((event) => String(event.state ?? "").toUpperCase() === state);
    if (category && category !== "all") events = events.filter((event) => String(event.category ?? "").toLowerCase() === category);
    if (status && status !== "all") events = events.filter((event) => String(event.event_status ?? "").toLowerCase() === status);
    if (actionable === "true") events = events.filter((event) => ["high", "medium"].includes(String(event.actionability ?? "").toLowerCase()));
    if (q) {
      events = events.filter(
        (event) =>
          includesNeedle(event.title, q) ||
          includesNeedle(event.bottle_name, q) ||
          includesNeedle(event.raw_name, q) ||
          includesNeedle(event.source, q) ||
          includesNeedle(event.location_name, q) ||
          includesNeedle(event.source_type_label, q) ||
          (Array.isArray(event.detected_products) && event.detected_products.some((product) => includesNeedle(product, q))) ||
          includesNeedle(event.city, q) ||
          includesNeedle(event.county, q)
      );
    }

    events.sort((a, b) => eventRank(b) - eventRank(a) || String(a.state).localeCompare(String(b.state)));
    const total = events.length;
    const pagedEvents = events.slice(offset, offset + limit);

    return NextResponse.json(
      {
        ...exportPayload,
        events: pagedEvents,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        facets,
        lastUpdated: exportPayload?.generatedAt ?? new Date().toISOString(),
      },
      {
        headers: {
          ...siteExportHeaders("local-export"),
          "X-Events-Source": "local-export",
        },
      }
    );
  } catch (err) {
    console.error("[api/events] Error reading site export:", err);
    return NextResponse.json(
      { events: [], total: 0, limit, offset, hasMore: false, lastUpdated: new Date().toISOString(), error: "Engine event export temporarily unavailable" },
      { status: 200, headers: { ...siteExportHeaders("empty-fallback"), "X-Events-Source": "empty-fallback" } }
    );
  }
}
