export type EmailAlertMode = "all" | "major_only" | "daily_roundup";

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
  sms: { enabled: false, available: false },
};

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)) as NotificationPreferences;
}

export function normalizeNotificationPreferences(input: unknown): NotificationPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const onSite = (source.onSite && typeof source.onSite === "object" ? source.onSite : {}) as Record<string, unknown>;
  const email = (source.email && typeof source.email === "object" ? source.email : {}) as Record<string, unknown>;
  const sms = (source.sms && typeof source.sms === "object" ? source.sms : {}) as Record<string, unknown>;

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
      enabled: false,
      available: DEFAULT_NOTIFICATION_PREFERENCES.sms.available,
    },
  };
}

export function buildAlertId(userId: string, dedupeKey: string, createdAt: string) {
  return Buffer.from(`${userId}:${dedupeKey}:${createdAt}`).toString("base64url");
}
