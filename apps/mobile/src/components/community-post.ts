import type { Signal } from "../api/types";
import { badgeCatalog } from "../rewards/badge-catalog";

export function communityPhotoUrl(signal: Signal) {
  if (signal.source.type !== "member" || !signal.evidence.photo || !signal.evidence.photoUrl) return null;
  try {
    const url = new URL(signal.evidence.photoUrl);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com") ? url.href : null;
  } catch { return null; }
}

export function communityBadges(signal: Signal) {
  return [...new Set((signal.source.actor?.badges || []).filter(label => typeof label === "string" && label.trim()).map(label => label.trim().slice(0, 100)))].slice(0, 3);
}

export function communityBadgeIcon(label: string) {
  if (/Most Active/.test(label)) return "fire" as const;
  if (/Top Contributor/.test(label)) return "trophy-outline" as const;
  if (/Helpful Neighbor/.test(label)) return "hand-heart-outline" as const;
  if (/Photo Finish/.test(label)) return "camera-outline" as const;
  if (/Local Scout/.test(label)) return "map-marker-star-outline" as const;
  if (/Weekly Streak/.test(label)) return "fire" as const;
  if (/Spotter/.test(label)) return "binoculars" as const;
  if (/Unicorn Hunter/.test(label)) return "unicorn-variant" as const;
  if (/Store Explorer/.test(label)) return "store-search-outline" as const;
  if (/Availability Scout/.test(label)) return "store-check-outline" as const;
  if (/Community Builder/.test(label)) return "account-group-outline" as const;
  return "medal-outline" as const;
}

export function communityPhotoHeight(screenHeight: number) {
  return Math.max(110, Math.min(180, Math.round(screenHeight * 0.22)));
}

export function communityBadgeDescription(label: string) {
  if (/^(Most Active|Top Contributor) · /.test(label)) {
    const period = / · \d{4}$/.test(label) ? "year" : "month";
    return label.startsWith("Most Active") ? `Led the community in qualifying active days during the completed ${period}.` : `Led the community in contribution score during the completed ${period}.`;
  }
  const definition = badgeCatalog.find(item => label === item.name || label.startsWith(`${item.name} · `));
  if (!definition) return "Earned community recognition.";
  const tier = / · (Bronze|Silver|Gold|Platinum|Diamond)$/.exec(label)?.[1].toLowerCase();
  const milestone = definition.milestones.find(item => item.tier === (tier || null));
  return definition.description.replace("{target}", String(milestone?.target || 1));
}
