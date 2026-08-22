import { BADGE_DESCRIPTIONS } from "@/lib/sighting-rewards";

const BADGE_ICON_BY_KEY: Record<string, string> = {
  first_sighting: "/badge-icons/first-sighting.png",
  helpful_neighbor: "/badge-icons/helpful-neighbor-fit.png",
  photo_finish: "/badge-icons/photo-finish-fit.png",
  spotter: "/badge-icons/spotter-bronze-fit.png",
  unicorn_hunter: "/badge-icons/unicorn-hunter-bronze-fit.png",
  sharp_eye: "/badge-icons/sharp-eye.png",
  local_scout: "/badge-icons/local-scout.png",
  weekend_warrior: "/badge-icons/weekend-warrior.png",
  clean_signal: "/badge-icons/clean-signal.png",
  streak: "/badge-icons/streak.png",
};

const BADGE_ICON_BY_ID: Record<string, string> = {
  spotter_bronze: "/badge-icons/spotter-bronze-fit.png",
  spotter_silver: "/badge-icons/spotter-silver-fit.png",
  spotter_diamond: "/badge-icons/spotter-diamond-fit.png",
  unicorn_hunter_bronze: "/badge-icons/unicorn-hunter-bronze-fit.png",
  unicorn_hunter_silver: "/badge-icons/unicorn-hunter-silver-fit.png",
  unicorn_hunter_diamond: "/badge-icons/unicorn-hunter-diamond-fit.png",
};

export function signalPointsBadgeBaseKey(id: string) {
  const baseKey = id.replace(/_(bronze|silver|gold|platinum|diamond)$/u, "");
  return baseKey === "verified_scout" ? "helpful_neighbor" : baseKey;
}

export function signalPointsBadgeIcon(id: string) {
  return BADGE_ICON_BY_ID[id] || BADGE_ICON_BY_KEY[signalPointsBadgeBaseKey(id)] || null;
}

export function signalPointsBadgeLabel(id: string, label: string) {
  if (signalPointsBadgeBaseKey(id) === "helpful_neighbor") return "Helpful Neighbor";
  return label.replace(/Verified Scout/gi, "Helpful Neighbor").replace(/verified/gi, "helpful");
}

export function signalPointsBadgeDescription(id: string) {
  return BADGE_DESCRIPTIONS[signalPointsBadgeBaseKey(id) as keyof typeof BADGE_DESCRIPTIONS]
    || "Badge requirements are not available.";
}
