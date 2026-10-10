import type { MemberAlert } from "../api/types";

export function radarAlertLocation(alert: Pick<MemberAlert, "storeLabel" | "matchedArea" | "state">) {
  const store = alert.storeLabel.split(/\s[-–—]\s/)[0].trim();
  const city = alert.storeLabel.match(/[,·]\s*([^,·]+),\s*([A-Z]{2})\b/);
  const area = city ? `${city[1].trim()}, ${city[2]}` : alert.matchedArea.trim();
  const locality = area && area.toLowerCase() !== store.toLowerCase() ? area : alert.state;
  return [store, locality].filter(Boolean).join(" · ");
}

export function groupRadarReports(alerts: MemberAlert[]) {
  const groups = new Map<string, MemberAlert[]>();
  for (const alert of alerts) {
    const names = alert.bottleNames?.length ? alert.bottleNames.slice().sort() : [alert.bottleName || alert.id];
    const key = JSON.stringify([names, alert.storeLabel, alert.state, alert.sourceType]);
    const group = groups.get(key);
    if (group) group.push(alert); else groups.set(key, [alert]);
  }
  return [...groups.values()];
}
