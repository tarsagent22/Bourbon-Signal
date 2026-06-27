export type EmailAlertMode = "all" | "major_only" | "daily_roundup";
export type SmsAlertMode = "major_only" | "specific_bottles";

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

  const mode = email.mode === "all" || email.mode === "major_only" || email.mode === "daily_roundup"
    ? email.mode
    : DEFAULT_NOTIFICATION_PREFERENCES.email.mode;

  return {
    onSite: {
      enabled: typeof onSite.enabled === "boolean" ? onSite.enabled : DEFAULT_NOTIFICATION_PREFERENCES.onSite.enabled,
    },
    email: {
      enabled: typeof email.enabled === "boolean" ? email.enabled : DEFAULT_NOTIFICATION_PREFERENCES.email.enabled,
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
  };
}

export function buildAlertId(userId: string, dedupeKey: string, createdAt: string) {
  return Buffer.from(`${userId}:${dedupeKey}:${createdAt}`).toString("base64url");
}
