export type EmailAlertMode = "all" | "major_only";
export type SmsAlertMode = "major_only" | "specific_bottles";

export interface WeeklyIntelligencePreference {
  emailEnabled: boolean;
  optedInAt: string | null;
  unsubscribedAt: string | null;
  version: number;
}

export type WeeklyIntelligencePreferenceAction = "subscribe" | "unsubscribe";

export interface WeeklyIntelligencePreferenceActionRequest {
  action: WeeklyIntelligencePreferenceAction;
  expectedVersion: number;
}

export interface NotificationPreferences {
  onSite: {
    enabled: boolean;
  };
  email: {
    enabled: boolean;
    mode: EmailAlertMode;
  };
  sms: {
    enabled: boolean;
    available: boolean;
    mode: SmsAlertMode;
    phone?: string;
    verified: boolean;
  };
  sightings: {
    enabled: boolean;
  };
  weeklyIntelligence: WeeklyIntelligencePreference;
}

export interface NotificationPreferencesPatch {
  onSite?: Partial<NotificationPreferences["onSite"]>;
  email?: Partial<NotificationPreferences["email"]>;
  sms?: Partial<NotificationPreferences["sms"]>;
  sightings?: Partial<NotificationPreferences["sightings"]>;
  weeklyIntelligence?: Partial<WeeklyIntelligencePreference> & Partial<WeeklyIntelligencePreferenceActionRequest>;
}

export type NotificationPreferencesMetadataPatch = {
  [Key in Exclude<keyof NotificationPreferences, "weeklyIntelligence">]?: NotificationPreferences[Key];
} & {
  weeklyIntelligence?: Partial<WeeklyIntelligencePreference>;
};

export class WeeklyIntelligencePreferenceConflict extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("Weekly intelligence preference changed; refresh before trying again.");
    this.name = "WeeklyIntelligencePreferenceConflict";
    this.currentVersion = currentVersion;
  }
}

export interface MemberAlertRecord {
  id: string;
  userId: string;
  dedupeKey: string;
  bottleName: string;
  state: string;
  storeLabel: string;
  matchedArea: string;
  eventType: string;
  rarityTier: string | null;
  quantity: number | null;
  score: number;
  priorityClass: "major" | "standard";
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  emailDeliveredAt: string | null;
  emailModeAtSend: EmailAlertMode | null;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  onSite: { enabled: true },
  email: { enabled: false, mode: "major_only" },
  sms: { enabled: false, available: true, mode: "major_only", verified: false },
  sightings: { enabled: false },
  weeklyIntelligence: { emailEnabled: false, optedInAt: null, unsubscribedAt: null, version: 0 },
};

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)) as NotificationPreferences;
}

export function normalizeNotificationPreferences(input: unknown): NotificationPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const onSite = (source.onSite && typeof source.onSite === "object" ? source.onSite : {}) as Record<string, unknown>;
  const email = (source.email && typeof source.email === "object" ? source.email : {}) as Record<string, unknown>;
  const sms = (source.sms && typeof source.sms === "object" ? source.sms : {}) as Record<string, unknown>;
  const sightings = (source.sightings && typeof source.sightings === "object" ? source.sightings : {}) as Record<string, unknown>;
  const weeklyIntelligence = (source.weeklyIntelligence && typeof source.weeklyIntelligence === "object" ? source.weeklyIntelligence : {}) as Record<string, unknown>;

  const legacyDailyRoundup = email.mode === "daily_roundup";
  const mode = email.mode === "all" || email.mode === "major_only"
    ? email.mode
    : DEFAULT_NOTIFICATION_PREFERENCES.email.mode;
  const optedInAt = typeof weeklyIntelligence.optedInAt === "string" ? weeklyIntelligence.optedInAt : null;
  const unsubscribedAt = typeof weeklyIntelligence.unsubscribedAt === "string" ? weeklyIntelligence.unsubscribedAt : null;
  const optedInTime = optedInAt ? Date.parse(optedInAt) : Number.NaN;
  const unsubscribedTime = unsubscribedAt ? Date.parse(unsubscribedAt) : Number.NaN;
  const emailEnabled = unsubscribedAt
    ? Number.isFinite(optedInTime) && Number.isFinite(unsubscribedTime) && optedInTime > unsubscribedTime
    : weeklyIntelligence.emailEnabled === true;

  return {
    onSite: {
      enabled: typeof onSite.enabled === "boolean" ? onSite.enabled : DEFAULT_NOTIFICATION_PREFERENCES.onSite.enabled,
    },
    email: {
      // Daily roundup was never shipped. Disable legacy selections rather than
      // silently converting them into real-time emails.
      enabled: legacyDailyRoundup ? false : (typeof email.enabled === "boolean" ? email.enabled : DEFAULT_NOTIFICATION_PREFERENCES.email.enabled),
      mode,
    },
    sms: {
      enabled: typeof sms.enabled === "boolean" ? sms.enabled : DEFAULT_NOTIFICATION_PREFERENCES.sms.enabled,
      available: DEFAULT_NOTIFICATION_PREFERENCES.sms.available,
      mode: sms.mode === "specific_bottles" ? "specific_bottles" : DEFAULT_NOTIFICATION_PREFERENCES.sms.mode,
      phone: typeof sms.phone === "string" ? sms.phone.trim().slice(0, 32) : undefined,
      verified: sms.verified === true,
    },
    sightings: {
      enabled: typeof sightings.enabled === "boolean" ? sightings.enabled : DEFAULT_NOTIFICATION_PREFERENCES.sightings.enabled,
    },
    weeklyIntelligence: {
      emailEnabled,
      optedInAt,
      unsubscribedAt,
      version: Number.isInteger(weeklyIntelligence.version) && Number(weeklyIntelligence.version) >= 0
        ? Number(weeklyIntelligence.version)
        : 0,
    },
  };
}

export function applyWeeklyIntelligencePreferenceTransition(input: {
  existing: WeeklyIntelligencePreference;
  requested: WeeklyIntelligencePreferenceActionRequest;
  now: string;
}): WeeklyIntelligencePreference {
  if (!Number.isInteger(input.requested.expectedVersion) || input.requested.expectedVersion !== input.existing.version) {
    throw new WeeklyIntelligencePreferenceConflict(input.existing.version);
  }
  if (input.requested.action === "subscribe") {
    return {
      emailEnabled: true,
      optedInAt: input.now,
      unsubscribedAt: input.existing.unsubscribedAt,
      version: input.existing.version + 1,
    };
  }
  return applyWeeklyIntelligenceUnsubscribe(input.existing, input.now);
}

export function weeklyIntelligenceExplicitlyEnabled(preference: WeeklyIntelligencePreference) {
  const optedInAt = preference.optedInAt ? Date.parse(preference.optedInAt) : Number.NaN;
  if (!Number.isFinite(optedInAt)) return false;
  if (!preference.unsubscribedAt) return preference.emailEnabled === true;
  const unsubscribedAt = Date.parse(preference.unsubscribedAt);
  return Number.isFinite(unsubscribedAt) && optedInAt > unsubscribedAt;
}

export function applyWeeklyIntelligenceUnsubscribe(
  existing: WeeklyIntelligencePreference,
  occurredAt: string,
): WeeklyIntelligencePreference {
  if (existing.unsubscribedAt && !weeklyIntelligenceExplicitlyEnabled(existing)) return existing;
  return {
    ...existing,
    emailEnabled: false,
    unsubscribedAt: occurredAt,
    version: existing.version + 1,
  };
}

function nestedRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function supplied(source: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(source, field) && nestedRecord(source[field]) !== null;
}

export function applyNotificationPreferencesPatch(input: {
  existing: NotificationPreferences;
  requested: NotificationPreferencesPatch | unknown;
  now: string;
}) {
  const existing = normalizeNotificationPreferences(input.existing);
  const source = nestedRecord(input.requested) || {};
  const merged = {
    ...existing,
    onSite: { ...existing.onSite, ...(nestedRecord(source.onSite) || {}) },
    email: { ...existing.email, ...(nestedRecord(source.email) || {}) },
    sms: { ...existing.sms, ...(nestedRecord(source.sms) || {}) },
    sightings: { ...existing.sightings, ...(nestedRecord(source.sightings) || {}) },
    weeklyIntelligence: existing.weeklyIntelligence,
  };
  let preferences = normalizeNotificationPreferences(merged);
  const metadataPatch: NotificationPreferencesMetadataPatch = {};

  if (supplied(source, "onSite")) metadataPatch.onSite = preferences.onSite;
  if (supplied(source, "email")) metadataPatch.email = preferences.email;
  if (supplied(source, "sms")) metadataPatch.sms = preferences.sms;
  if (supplied(source, "sightings")) metadataPatch.sightings = preferences.sightings;

  const weeklyRequest = nestedRecord(source.weeklyIntelligence);
  if (weeklyRequest && (weeklyRequest.action === "subscribe" || weeklyRequest.action === "unsubscribe")) {
    const weeklyIntelligence = applyWeeklyIntelligencePreferenceTransition({
      existing: existing.weeklyIntelligence,
      requested: {
        action: weeklyRequest.action,
        expectedVersion: typeof weeklyRequest.expectedVersion === "number" ? weeklyRequest.expectedVersion : Number.NaN,
      },
      now: input.now,
    });
    preferences = { ...preferences, weeklyIntelligence };
    metadataPatch.weeklyIntelligence = weeklyRequest.action === "subscribe"
      ? {
          emailEnabled: true,
          optedInAt: weeklyIntelligence.optedInAt,
          version: weeklyIntelligence.version,
        }
      : {
          emailEnabled: false,
          unsubscribedAt: weeklyIntelligence.unsubscribedAt,
          version: weeklyIntelligence.version,
        };
  }

  return { preferences, metadataPatch };
}

export function buildAlertId(userId: string, dedupeKey: string, createdAt: string) {
  return Buffer.from(`${userId}:${dedupeKey}:${createdAt}`).toString("base64url");
}
