export interface Signal {
  contractVersion: "bourbon-signal/signal@1";
  id: string;
  kind: "availability" | "release" | "event";
  source: {
    type: "member" | "retailer" | "trusted_source" | "release_source";
    label: string;
    reportMode?: "seen_in_store" | "reported_online";
    actor?: { kind: "founder" | "member"; number: number; label: string; displayName?: string };
  };
  bottle: { id?: string; name: string; rarity?: "limited" | "allocated" | "unicorn" };
  location: {
    scope: "exact_store" | "area" | "board" | "state" | "online" | "unknown";
    label?: string;
    state?: string;
    store?: { id?: string; name?: string; address?: string; city?: string; state?: string; zip?: string };
  };
  timing: { observedAt?: string; reportedAt?: string; displayAt: string; scheduledFor?: string; expiresAt?: string };
  evidence: { summary?: string; photo: boolean; corroborationCount: number; helpfulCount: number; retailerReported: boolean; sourceBacked: boolean };
  strength: "best" | "more_activity";
  availability?: {
    status: "available_now" | "upcoming" | "reported" | "unknown";
    quantity?: number;
    quantityLabel?: string;
    price?: number;
    label?: string;
    caveat?: string;
  };
  alertEligibility: { inventory: boolean; watch: boolean };
  actions: Array<"watch_bottle" | "watch_store" | "confirm" | "correct" | "helpful" | "report">;
}

export interface MarketSummary {
  state: string;
  areaLabel: string;
  signalCount: number;
  bottleNames: string[];
}

export interface SignalFeedPage {
  contractVersion: "bourbon-signal/signal@1";
  view: "market" | "community" | "all";
  signals: Signal[];
  marketSummaries: MarketSummary[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  degraded: boolean;
  lastUpdated?: string;
  access: { previewLocked: boolean; requiresAccountForFullFeed: boolean; memberSignalsAvailable: boolean; marketDetailsLocked: boolean };
}

export interface MemberProfile {
  contractVersion: "bourbon-signal/mobile-api@1";
  profile: {
    identity: { kind: "founder" | "member"; number: number; label: string } | null;
    displayName: string;
    customDisplayName: string | null;
    feedAreas: {
      states: Array<{
        code: string;
        label: string;
        areaLabel: "Board" | "City";
        options: Array<{ value: string; label: string }>;
        monitoringLevels?: MonitoringScopeType[];
        engineCoverage?: "active" | "expanding";
      }>;
    };
    membership: { tier: "free" | "standard" | "barrel" | "bottled-in-bond"; label: string; paid: boolean; hasBetaAccess: boolean };
    entitlements: { fullFeed: boolean; canSubmitSignals: boolean };
  };
}

export interface MemberProfilePatch {
  displayName: string | null;
}

export interface MemberCollectionBottle {
  bottleId: string;
  bottleName: string;
  canonicalKey: string;
  rating: number;
  tasteTags?: string[];
  wouldBuyAgain?: boolean;
  notes?: string;
  addedAt: string;
  updatedAt: string;
}

export interface RadarAreaPreferences {
  states: string[];
  ncBoards: string[];
  gaAreas: string[];
  tnAreas: string[];
  vaCities: string[];
  ohCities: string[];
  iaCities: string[];
  idCities: string[];
  scAreas: string[];
  caAreas: string[];
  nvAreas: string[];
  nyAreas: string[];
  coAreas: string[];
  paCounties: string[];
  paStores: string[];
}

export type MonitoringScopeType = "state" | "county" | "city" | "board" | "store";
export interface MonitoringScope { type: MonitoringScopeType; id: string; state: string; label: string }

export interface MemberPreferences {
  entitlements?: {
    canUseCollection?: boolean;
    alertAreaLimit?: number | null;
    trackedBottleLimit?: number | null;
    canReceiveSmsAlerts?: boolean;
  };
  areaPreferences: RadarAreaPreferences;
  monitoringScopes: MonitoringScope[];
  notificationPreferences: {
    onSite: { enabled: boolean };
    push: { enabled: boolean };
    email: { enabled: boolean; mode: "all" | "major_only" };
    sms: { enabled: boolean; available: boolean; verified: boolean; mode: "major_only" | "specific_bottles"; phone?: string };
    sightings: { enabled: boolean };
  };
  alertMode: "specific_bottles" | "anything_notable";
  bottleAlertPreferences: { bottleNames: string[]; bottleKeys: string[] };
  collectionPreferences: { bottles: MemberCollectionBottle[]; version: number };
}

export interface MemberPreferencesPatch {
  areaPreferences?: RadarAreaPreferences;
  monitoringScopes?: MonitoringScope[];
  notificationPreferences?: {
    onSite?: Partial<MemberPreferences["notificationPreferences"]["onSite"]>;
    push?: Partial<MemberPreferences["notificationPreferences"]["push"]>;
    email?: Partial<MemberPreferences["notificationPreferences"]["email"]>;
    sms?: Partial<MemberPreferences["notificationPreferences"]["sms"]>;
    sightings?: Partial<MemberPreferences["notificationPreferences"]["sightings"]>;
  };
  alertMode?: MemberPreferences["alertMode"];
  bottleAlertPreferences?: MemberPreferences["bottleAlertPreferences"];
  collectionPreferences?: MemberPreferences["collectionPreferences"];
}

export interface MemberAlert {
  id: string;
  bottleName: string;
  bottleNames?: string[];
  state: string;
  storeLabel: string;
  matchedArea: string;
  eventType: string;
  rarityTier: "limited" | "allocated" | "unicorn" | null;
  quantity: number | null;
  score: number;
  priorityClass: "major" | "standard";
  signalAt?: string;
  freshnessLimitHours?: number;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  sourceType?: "engine" | "community";
  sourceLabel?: string;
}

export interface MemberAlertsResponse {
  alerts: MemberAlert[];
  unreadCount: number;
}

export interface RadarBottleOption { id: string; name: string; rarity?: "limited" | "allocated" | "unicorn" }

export interface PushDeviceStatus {
  supported: boolean;
  enabled: boolean;
  registeredDeviceCount: number;
  currentDeviceRegistered?: boolean;
  requestId?: string;
  preferenceProjection?: "saved" | "deferred";
  warning?: { code: string; message: string; requestId: string };
}

export interface GeographySearchResponse {
  contractVersion: "bourbon-signal/mobile-api@1";
  states: Array<{ id: string; code: string; name: string }>;
  results: Array<{
    id: string;
    level: MonitoringScopeType;
    state: string;
    name: string;
    coverage: { engine: { status: "active" | "expanding" }; community: { active: boolean; recentSightings: number; windowDays: number } };
    message: string | null;
  }>;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ReferralSummary {
  code: string;
  referralLink: string;
  referralPoints: number;
  referrals: { total: number; free: number; standard: number; barrel: number; founder: number };
}

export interface SignalRewardItem {
  key: string;
  name: string;
  points: number;
  fulfillmentType: "physical" | "digital";
  inventoryRemaining?: number | null;
}

export interface SignalPointsSummary {
  balance: number;
  debt: number;
  catalog: SignalRewardItem[];
  redemptions: Array<{ id: string; itemKey: string; pointsSpent: number; status: string; createdAt: string; updatedAt: string }>;
  tier: MemberProfile["profile"]["membership"]["tier"];
  redemptionEligible: boolean;
}

export interface SightingSubmission {
  bottleName: string;
  bottleId?: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storeCity: string;
  storeState: string;
  storeZip?: string;
  quantityEstimate?: string;
  price?: number | null;
  notes?: string;
  sightingType?: "seen_in_store" | "online_social";
  reviewState?: {
    needsBottleReview?: boolean;
    manualBottleName?: string;
    needsStoreReview?: boolean;
    manualStoreName?: string;
    manualStoreCity?: string;
    manualStoreState?: string;
    manualStoreZip?: string;
  };
}

export interface SightingSubmissionResponse {
  ok: true;
  created: boolean;
  duplicate?: boolean;
  sighting: { id: string; bottleName?: string; storeName?: string };
}
