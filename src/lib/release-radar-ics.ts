import { radarPath, type RadarEntry, type RadarOccurrence } from "./release-radar.ts";

interface ReleaseRadarIcsOptions {
  origin: string;
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function compactDate(value: string) {
  return value.slice(0, 10).replace(/-/g, "");
}

function utcTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function eventLines(entry: RadarEntry, date: string, rangeEnd?: string, occurrenceIndex = 0, occurrence?: RadarOccurrence) {
  const path = radarPath(entry);
  const entryStart = occurrenceIndex === 0 && entry.occurrenceDates === undefined && entry.occurrences === undefined ? entry.schemaStartDate : undefined;
  const entryEnd = occurrenceIndex === 0 && entry.occurrenceDates === undefined && entry.occurrences === undefined ? entry.schemaEndDate : undefined;
  const startTimestamp = occurrence?.schemaStartDate ? utcTimestamp(occurrence.schemaStartDate) : entryStart ? utcTimestamp(entryStart) : null;
  const endTimestamp = occurrence?.schemaEndDate ? utcTimestamp(occurrence.schemaEndDate) : entryEnd ? utcTimestamp(entryEnd) : null;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${entry.slug}-${compactDate(date)}@bourbonsignal.com`,
    `DTSTAMP:${compactDate(entry.updatedAt)}T000000Z`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DESCRIPTION:${escapeText(`${entry.dek} Announcement only; not live shelf inventory.`)}`,
    `URL:${path}`,
    "X-BOURBON-SIGNAL-SEMANTICS:announcement-only",
    `X-BOURBON-SIGNAL-VERIFICATION:${entry.verificationStatus}`,
  ];

  if (startTimestamp) {
    lines.push(`DTSTART:${startTimestamp}`);
    if (endTimestamp) lines.push(`DTEND:${endTimestamp}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(nextDay(rangeEnd || date))}`);
  }
  if (entry.location) lines.push(`LOCATION:${escapeText(entry.location)}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildReleaseRadarIcs(entries: RadarEntry[], options: ReleaseRadarIcsOptions) {
  const origin = options.origin.replace(/\/$/, "");
  const events = entries
    .filter((entry) => entry.datePrecision === "exact" && entry.calendar === true)
    .flatMap((entry) => {
      if (entry.occurrences?.length) {
        return entry.occurrences.flatMap((occurrence, index) => eventLines(entry, occurrence.date, undefined, index, occurrence));
      }
      if (entry.occurrenceDates?.length) {
        return entry.occurrenceDates.flatMap((date, index) => eventLines(entry, date, undefined, index));
      }
      return eventLines(entry, entry.startDate, entry.endDate);
    })
    .map((line) => line.startsWith("URL:/") ? `URL:${origin}${line.slice(4)}` : line);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bourbon Signal//Release Radar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Bourbon Signal Release Radar",
    "X-WR-CALDESC:Official and verified release dates; announcements are not live shelf inventory.",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
