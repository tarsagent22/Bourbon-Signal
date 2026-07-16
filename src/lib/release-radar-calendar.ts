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

export function getInitialRadarMonth(entries: RadarEntry[], today: string, fallbackMonth: string) {
  const futureStartDates = entries
    .filter((entry) => entry.calendar === true)
    .flatMap((entry) => {
      if (entry.occurrenceDates?.length) return entry.occurrenceDates.filter((date) => date >= today);
      return entry.startDate >= today ? [entry.startDate] : [];
    })
    .sort();

  return futureStartDates[0]?.slice(0, 7) || fallbackMonth;
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
    const monthStart = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
    const nextMonthStart = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const intersectsMonth = entry.startDate < nextMonthStart && entry.endDate >= monthStart;
    if (!intersectsMonth) return [];
    const continuesFromPriorMonth = entry.startDate < monthStart;
    return [{
      date: continuesFromPriorMonth ? monthStart : entry.startDate,
      label: continuesFromPriorMonth ? `Open through ${shortDate(entry.endDate)}` : entry.dateLabel,
      rangeEnd: entry.endDate,
    }];
  }

  return entry.startDate.startsWith(`${month}-`) ? [{ date: entry.startDate, label: entry.dateLabel }] : [];
}
