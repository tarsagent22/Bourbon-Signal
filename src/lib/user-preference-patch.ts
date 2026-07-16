export const USER_PREFERENCE_METADATA_FIELDS = [
  "areaPreferences",
  "notificationPreferences",
  "alertMode",
  "bottleAlertPreferences",
  "collectionPreferences",
  "radarPreferences",
  "sightingsPreferences",
] as const;

export type UserPreferenceMetadataField = typeof USER_PREFERENCE_METADATA_FIELDS[number];
export type UserPreferenceMetadataValues = Record<UserPreferenceMetadataField, unknown>;

export function buildSuppliedPreferenceMetadataPatch(
  payload: unknown,
  normalizedValues: UserPreferenceMetadataValues,
) {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const patch: Partial<UserPreferenceMetadataValues> = {};

  for (const field of USER_PREFERENCE_METADATA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      patch[field] = normalizedValues[field];
    }
  }

  return patch;
}
