import type { RadarEntry } from "./release-radar.ts";

export interface CalendarOccurrence {
  date: string;
  label: string;
  rangeEnd?: string;
}

function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function isValidMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

export function getCalendarOccurrences(entry: RadarEntry, month: string): CalendarOccurrence[] {
  const dates = entry.occurrenceDates?.length
    ? entry.occurrenceDates.map((date) => ({ date, label: shortDate(date) }))
    : entry.endDate && entry.endDate !== entry.startDate
      ? [
          { date: entry.startDate, label: `Opens ${shortDate(entry.startDate)}` },
          { date: entry.endDate, label: `Closes ${shortDate(entry.endDate)}` },
        ]
      : [{ date: entry.startDate, label: entry.dateLabel }];

  return dates.filter((occurrence) => occurrence.date.startsWith(`${month}-`));
}

export function getAgendaOccurrences(entry: RadarEntry, month: string): CalendarOccurrence[] {
  if (entry.occurrenceDates?.length) {
    return entry.occurrenceDates
      .filter((date) => date.startsWith(`${month}-`))
      .map((date) => ({ date, label: shortDate(date) }));
  }

  if (entry.endDate && entry.endDate !== entry.startDate) {
    const intersectsMonth = entry.startDate.startsWith(`${month}-`) || entry.endDate.startsWith(`${month}-`);
    return intersectsMonth ? [{ date: entry.startDate, label: entry.dateLabel, rangeEnd: entry.endDate }] : [];
  }

  return entry.startDate.startsWith(`${month}-`) ? [{ date: entry.startDate, label: entry.dateLabel }] : [];
}
