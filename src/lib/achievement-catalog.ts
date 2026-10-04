import { achievementCatalog as catalog } from "./achievement-definitions.ts";
export const achievementCatalog = catalog;
export const badgeFamily = (id: string) =>
  id.replace(/_(bronze|silver|gold|platinum|diamond)$/u, "");
export const canonicalBadgeId = (id: string) =>
  id === "verified_scout"
    ? "helpful_neighbor"
    : /^(spotter|unicorn_hunter)_diamond$/u.test(id)
      ? id.replace(/_diamond$/u, "_gold")
      : id;
export function achievementDefinition(id: string) {
  return catalog.find((item) => item.id === badgeFamily(canonicalBadgeId(id)));
}
export function achievementDescription(id: string, target?: number) {
  const definition = achievementDefinition(id);
  if (!definition)
    return id.startsWith("clean_signal")
      ? "Reached a sighting milestone in the original badge program."
      : id.startsWith("sharp_eye")
        ? "Earned community recognition in the original badge program."
        : "Earned in the original badge program.";
  const milestone = definition.milestones.find(
    (item) =>
      (item.tier ? `${definition.id}_${item.tier}` : definition.id) ===
      canonicalBadgeId(id),
  );
  const count = target ?? milestone?.target ?? 1;
  return definition.description
    .replace("{target}", String(count))
    .replace(/photos to 1 bottle/u, "a photo to 1 bottle")
    .replace(/1 bottle sightings/u, "1 bottle sighting")
    .replace(/1 sightings/u, "1 sighting")
    .replace(/1 friends/u, "1 friend");
}
