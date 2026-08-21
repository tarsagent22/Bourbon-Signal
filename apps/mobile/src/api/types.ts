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
  bottle: { id?: string; name: string };
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

export interface SignalFeedPage {
  contractVersion: "bourbon-signal/signal@1";
  signals: Signal[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  degraded: boolean;
  access: { previewLocked: boolean; requiresAccountForFullFeed: boolean; memberSignalsAvailable: boolean };
}

export interface MemberProfile {
  contractVersion: "bourbon-signal/mobile-api@1";
  profile: {
    identity: { kind: "founder" | "member"; number: number; label: string } | null;
    membership: { tier: "free" | "standard" | "barrel" | "bottled-in-bond"; label: string; paid: boolean; hasBetaAccess: boolean };
    entitlements: { fullFeed: boolean; canSubmitSignals: boolean };
  };
}
