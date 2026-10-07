export const LEADER_BADGE_POLICY = {
  month: { contributions: 5, activeDays: 3 },
  year: { contributions: 25, activeDays: 12 },
  settlementDays: 7,
  timeZone: "America/New_York",
} as const;

export function communityLeaderBadge(id: string) {
  const match = /^(most_active|top_contributor)_(month|year)_(\d{4})(?:_(\d{2}))?$/.exec(id);
  if (!match) return null;
  const [, kind, period, year, month] = match;
  if (Number(year) < 2026 || Number(year) > 9999) return null;
  if (period === "month" ? !month || Number(month) < 1 || Number(month) > 12 : !!month) return null;
  const name = kind === "most_active" ? "Most Active" : "Top Contributor";
  const date = period === "year" ? year : `${new Date(Date.UTC(Number(year), Number(month) - 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${year}`;
  const minimum = LEADER_BADGE_POLICY[period as "month" | "year"];
  return {
    id, name, period: period as "month" | "year", label: `${name} · ${date}`,
    icon: kind === "most_active" ? "fire" as const : "trophy-outline" as const,
    description: kind === "most_active" ? `Led the community in qualifying active days during ${date}.` : `Led the community in contribution score during ${date}.`,
    rules: `Calendar ${period}s use Eastern time and settle 7 days after closing. Requires ${minimum.contributions} qualifying contributions across ${minimum.activeDays} days. Most Active ranks distinct active days. Top Contributor scores 1 per qualifying sighting, 1 extra for an approved photo, 2 extra for a sighting endorsed by at least 3 other members with a net 3 helpful votes, and 2 per rewarded availability update. At most 3 sightings and 3 availability updates per day count. Repeated bottle/store/day posts, self-votes, pending submissions and moderated contributions are excluded. Tied leaders share the award. Recognition adds no Signal Points.`,
  };
}
