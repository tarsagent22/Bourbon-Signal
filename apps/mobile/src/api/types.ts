export interface Signal {
  contractVersion: "bourbon-signal/signal@1";
  id: string;
  kind: "availability" | "release" | "event";
  source: {
    type: "member" | "retailer" | "trusted_source" | "release_source";
    label: string;
    reportMode?: "seen_in_store" | "reported_online";
    actor?: { kind: "founder" | "member"; number: number; label: string };
  };
  bottle: { id?: string; name: string; rarity?: "limited" | "allocated" | "highly_allocated" | "unicorn" };
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
    membership: { tier: "free" | "standard" | "barrel" | "bottled-in-bond"; label: string; paid: boolean; hasBetaAccess: boolean };
    entitlements: { fullFeed: boolean; canSubmitSignals: boolean };
  };
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

export interface MemberPreferences {
  entitlements?: { canUseCollection?: boolean; alertAreaLimit?: number | null; trackedBottleLimit?: number | null };
  areaPreferences: { states: string[]; [key: string]: unknown };
  notificationPreferences: {
    onSite: { enabled: boolean };
    email: { enabled: boolean; mode: string };
    sms: { enabled: boolean; available: boolean; verified: boolean; mode: string };
    sightings: { enabled: boolean };
    weeklyIntelligence?: { emailEnabled: boolean };
  };
  alertMode: string;
  bottleAlertPreferences: { bottleNames: string[]; bottleKeys: string[] };
  collectionPreferences: { bottles: MemberCollectionBottle[]; version: number };
}

export interface MemberPreferencesPatch {
  collectionPreferences?: MemberPreferences["collectionPreferences"];
}

export interface MemberAlert {
  id: string;
  bottleName: string;
  state: string;
  storeLabel: string;
  matchedArea: string;
  priorityClass: "major" | "standard";
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
}

export interface MemberAlertsResponse {
  alerts: MemberAlert[];
  unreadCount: number;
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
